"""Advanced BPMN analytics calculation service.

Parses a BPMN XML document (one session) and computes process metrics:
total ee_time, subprocess breakdown, all paths, critical path / slack,
utilization, ingredients, resources and property coverage.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from ..utils.parsing import parse_recalc_number, text


BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn"

# Element tags that carry execution time and are part of the process path.
_TASK_TAGS = {
    f"{{{BPMN_NS}}}task",
    f"{{{BPMN_NS}}}userTask",
    f"{{{BPMN_NS}}}serviceTask",
}
_FLOW_NODE_TAGS = _TASK_TAGS | {
    f"{{{BPMN_NS}}}startEvent",
    f"{{{BPMN_NS}}}endEvent",
    f"{{{BPMN_NS}}}subProcess",
    f"{{{BPMN_NS}}}exclusiveGateway",
    f"{{{BPMN_NS}}}parallelGateway",
    f"{{{BPMN_NS}}}inclusiveGateway",
}

# Default set of properties checked by the coverage report.
_REQUIRED_COVERAGE_KEYS = [
    "ee_time",
    "operation_code",
    "display_name",
    "recipe_context",
    "params",
    "allowed_outputs",
]
_OPTIONAL_COVERAGE_PREFIXES = ("ingredient_", "resource_", "capacity_")


def _bpmn_tag(local: str) -> str:
    return f"{{{BPMN_NS}}}{local}"


def _camunda_tag(local: str) -> str:
    return f"{{{CAMUNDA_NS}}}{local}"


@dataclass
class BpmnElement:
    id: str
    name: str
    tag: str
    properties: Dict[str, str] = field(default_factory=dict)
    incoming: List[str] = field(default_factory=list)
    outgoing: List[str] = field(default_factory=list)
    children: List["BpmnElement"] = field(default_factory=list)

    @property
    def ee_time(self) -> float:
        return parse_recalc_number(self.properties.get("ee_time")) or 0.0

    @property
    def display_type(self) -> str:
        return self.tag.replace(f"{{{BPMN_NS}}}", "")


@dataclass
class PathInfo:
    path_id: int
    node_ids: List[str]
    node_names: List[str]
    total_ee_time: float
    is_critical: bool = False

    @property
    def description(self) -> str:
        return " → ".join(self.node_names) or "—"


@dataclass
class SubprocessInfo:
    subprocess_id: str
    subprocess_name: str
    total_ee_time: float


@dataclass
class ParallelInfo:
    sequential_time: float
    parallel_time: float
    time_saved: float
    efficiency_ratio: float


@dataclass
class BottleneckInfo:
    element_id: str
    element_name: str
    ee_time: float
    slack: float
    is_bottleneck: bool


@dataclass
class UtilizationInfo:
    element_id: str
    element_name: str
    ee_time: float
    process_parallel_time: float
    utilization_rate: float


@dataclass
class IngredientSummary:
    ingredient_name: str
    total_quantity: float
    unit: str


@dataclass
class IngredientDetail:
    element_id: str
    element_name: str
    ingredient_name: str
    quantity: float
    unit: str


@dataclass
class ResourceInfo:
    resource_name: str
    peak_consumption: float
    total_consumption: float
    unit: str


@dataclass
class CoverageInfo:
    element_id: str
    element_name: str
    element_type: str
    ee_time_present: bool
    operation_code_present: bool
    display_name_present: bool
    recipe_context_present: bool
    params_present: bool
    allowed_outputs_present: bool
    coverage_score: float
    is_complete: bool


@dataclass
class CoverageSummary:
    total_elements: int
    elements_with_ee_time: int
    elements_without_ee_time: int
    average_coverage_score: float
    complete_elements_count: int
    incomplete_elements_count: int


@dataclass
class AdvancedCalculationResult:
    total_ee_time: float
    subprocesses: List[SubprocessInfo]
    paths: List[PathInfo]
    parallel: ParallelInfo
    bottlenecks: List[BottleneckInfo]
    utilization: List[UtilizationInfo]
    ingredients_summary: List[IngredientSummary]
    ingredients_detail: List[IngredientDetail]
    resources: List[ResourceInfo]
    coverage: List[CoverageInfo]
    coverage_summary: CoverageSummary
    elements: List[Dict[str, Any]]
    warnings: List[str] = field(default_factory=list)


class BpmnAnalyzer:
    """Analyzes a single BPMN XML document."""

    def __init__(self, bpmn_xml: str):
        self.warnings: List[str] = []
        self.root = self._parse(bpmn_xml)
        self.elements: Dict[str, BpmnElement] = {}
        self.flows: Dict[str, Tuple[str, str]] = {}
        self._load()

    def _parse(self, bpmn_xml: str) -> ET.Element:
        try:
            return ET.fromstring(bpmn_xml)
        except ET.ParseError as exc:
            raise ValueError(f"Invalid BPMN XML: {exc}") from exc

    def _load(self) -> None:
        for process in self.root.iter(_bpmn_tag("process")):
            self._load_process(process)

    def _load_process(self, process: ET.Element) -> None:
        # First pass: collect top-level flow nodes (subprocess children are
        # registered recursively) and sequence flows.
        for elem in process:
            tag = elem.tag
            if tag in _FLOW_NODE_TAGS:
                self._register_element(elem)
            elif tag == _bpmn_tag("sequenceFlow"):
                flow_id = elem.get("id", "")
                source = elem.get("sourceRef", "")
                target = elem.get("targetRef", "")
                if flow_id and source and target:
                    self.flows[flow_id] = (source, target)

        # Second pass: resolve incoming/outgoing references for top-level nodes.
        for elem in process:
            if elem.tag in _FLOW_NODE_TAGS:
                self._resolve_flow_refs(elem)

    def _register_element(self, elem: ET.Element, parent: Optional[BpmnElement] = None) -> BpmnElement:
        elem_id = elem.get("id", "")
        if not elem_id:
            return BpmnElement(id="", name="", tag=elem.tag)

        props: Dict[str, str] = {}
        ext = elem.find(_bpmn_tag("extensionElements"))
        if ext is not None:
            for camunda_props in ext.iter(_camunda_tag("properties")):
                for prop in camunda_props.iter(_camunda_tag("property")):
                    name = prop.get("name", "")
                    value = prop.get("value", "")
                    if name:
                        props[name] = value

        element = BpmnElement(
            id=elem_id,
            name=text(elem.get("name")),
            tag=elem.tag,
            properties=props,
        )

        # Recursively register subprocess children so we can compute nested totals.
        # _register_element with parent=element automatically appends to element.children.
        if elem.tag == _bpmn_tag("subProcess"):
            for child in elem:
                if child.tag in _FLOW_NODE_TAGS:
                    self._register_element(child, parent=element)

        if parent is None:
            self.elements[elem_id] = element
        else:
            parent.children.append(element)
        return element

    def _resolve_flow_refs(self, elem: ET.Element) -> None:
        elem_id = elem.get("id", "")
        element = self.elements.get(elem_id)
        if not element:
            return
        element.incoming = [text(child.text) for child in elem.findall(_bpmn_tag("incoming")) if text(child.text)]
        element.outgoing = [text(child.text) for child in elem.findall(_bpmn_tag("outgoing")) if text(child.text)]

    # ------------------------------------------------------------------
    # Basic metrics
    # ------------------------------------------------------------------

    def task_elements(self) -> List[BpmnElement]:
        return [el for el in self.elements.values() if el.tag in _TASK_TAGS]

    def time_contributing_elements(self) -> List[BpmnElement]:
        """Elements that contribute to process execution time (tasks + subprocesses)."""
        return [
            el for el in self.elements.values()
            if el.tag in _TASK_TAGS or el.tag == _bpmn_tag("subProcess")
        ]

    def effective_ee_time(self, element: BpmnElement) -> float:
        """Execution time of an element; for subprocesses returns internal total."""
        if element.tag == _bpmn_tag("subProcess"):
            return round(self._subprocess_ee_time(element), 2)
        return element.ee_time

    def all_flow_nodes(self) -> List[BpmnElement]:
        return list(self.elements.values())

    def start_events(self) -> List[BpmnElement]:
        return [el for el in self.elements.values() if el.tag == _bpmn_tag("startEvent")]

    def end_events(self) -> List[BpmnElement]:
        return [el for el in self.elements.values() if el.tag == _bpmn_tag("endEvent")]

    def total_ee_time(self) -> float:
        return round(sum(self.effective_ee_time(el) for el in self.time_contributing_elements()), 2)

    def subprocess_summary(self) -> List[SubprocessInfo]:
        result: List[SubprocessInfo] = []
        for el in self.elements.values():
            if el.tag == _bpmn_tag("subProcess"):
                total = self._subprocess_ee_time(el)
                result.append(SubprocessInfo(
                    subprocess_id=el.id,
                    subprocess_name=el.name or el.id,
                    total_ee_time=round(total, 2),
                ))
        return result

    def _subprocess_ee_time(self, proc: BpmnElement) -> float:
        total = 0.0
        for child in proc.children:
            if child.tag in _TASK_TAGS:
                total += child.ee_time
            elif child.tag == _bpmn_tag("subProcess"):
                total += self._subprocess_ee_time(child)
        return total

    # ------------------------------------------------------------------
    # Path enumeration
    # ------------------------------------------------------------------

    def all_paths(self, max_paths: int = 1000) -> List[PathInfo]:
        starts = self.start_events()
        ends = set(el.id for el in self.end_events())
        if not starts:
            self.warnings.append("No start events found; path analysis is empty.")
            return []
        if not ends:
            self.warnings.append("No end events found; path analysis is empty.")
            return []

        raw_paths: List[List[str]] = []

        def dfs(node_id: str, path: List[str], visited: Set[str]) -> None:
            if len(raw_paths) >= max_paths:
                return
            path.append(node_id)
            if node_id in ends:
                raw_paths.append(list(path))
                path.pop()
                return
            if node_id in visited:
                self.warnings.append(f"Cycle detected at node {node_id}; path truncated.")
                path.pop()
                return
            visited.add(node_id)
            node = self.elements.get(node_id)
            outgoing = node.outgoing if node else []
            for flow_id in outgoing:
                _, target = self.flows.get(flow_id, (None, None))
                if target:
                    dfs(target, path, visited)
            visited.remove(node_id)
            path.pop()

        for start in starts:
            dfs(start.id, [], set())

        if len(raw_paths) >= max_paths:
            self.warnings.append(f"Path enumeration stopped at {max_paths} paths.")

        # Build PathInfo objects and mark critical ones.
        path_infos: List[PathInfo] = []
        max_time = 0.0
        for node_ids in raw_paths:
            total = sum(self.elements[nid].ee_time for nid in node_ids if nid in self.elements)
            max_time = max(max_time, total)
        for idx, node_ids in enumerate(raw_paths, start=1):
            total = sum(self.effective_ee_time(self.elements[nid]) for nid in node_ids if nid in self.elements)
            names = [self.elements[nid].name or self.elements[nid].id for nid in node_ids]
            path_infos.append(PathInfo(
                path_id=idx,
                node_ids=node_ids,
                node_names=names,
                total_ee_time=round(total, 2),
                is_critical=abs(total - max_time) < 0.001,
            ))
        return path_infos

    # ------------------------------------------------------------------
    # Critical path / slack (CPM on DAG)
    # ------------------------------------------------------------------

    def _build_dag(self) -> Dict[str, List[str]]:
        """Return adjacency list of node ids based on sequenceFlow targets."""
        graph: Dict[str, List[str]] = {node_id: [] for node_id in self.elements}
        for source, target in self.flows.values():
            if source in graph and target in self.elements:
                graph[source].append(target)
        return graph

    def _topological_order(self, graph: Dict[str, List[str]]) -> Optional[List[str]]:
        """Kahn's algorithm. Returns None if graph has a cycle."""
        in_degree: Dict[str, int] = {node: 0 for node in graph}
        for succs in graph.values():
            for succ in succs:
                in_degree[succ] = in_degree.get(succ, 0) + 1
        queue = [n for n, d in in_degree.items() if d == 0]
        order: List[str] = []
        while queue:
            node = queue.pop(0)
            order.append(node)
            for succ in graph[node]:
                in_degree[succ] -= 1
                if in_degree[succ] == 0:
                    queue.append(succ)
        if len(order) != len(graph):
            return None
        return order

    def _critical_path_metrics(self) -> Tuple[float, Dict[str, float], Dict[str, float], Dict[str, float]]:
        """Return (critical_path_time, earliest_start, earliest_finish, slack)."""
        graph = self._build_dag()
        order = self._topological_order(graph)
        if order is None:
            self.warnings.append("Graph contains cycles; critical path calculation may be inaccurate.")
            # Fallback: use path enumeration max.
            paths = self.all_paths()
            parallel_time = max((p.total_ee_time for p in paths), default=0.0)
            empty = {node_id: 0.0 for node_id in self.elements}
            return parallel_time, empty, empty, empty

        # Forward pass: earliest start/finish.
        earliest_start: Dict[str, float] = {node_id: 0.0 for node_id in self.elements}
        earliest_finish: Dict[str, float] = {node_id: 0.0 for node_id in self.elements}
        for node_id in order:
            node = self.elements[node_id]
            duration = self.effective_ee_time(node)
            # For join nodes with multiple predecessors, ES = max(EF of preds).
            preds = [src for src, succs in graph.items() if node_id in succs]
            if preds:
                earliest_start[node_id] = max(earliest_finish[p] for p in preds)
            earliest_finish[node_id] = earliest_start[node_id] + duration

        ends = [el.id for el in self.end_events()]
        if not ends:
            ends = [node_id for node_id in self.elements if not graph[node_id]]
        critical_path_time = max((earliest_finish[e] for e in ends), default=0.0)

        # Backward pass: latest finish/start.
        latest_finish: Dict[str, float] = {node_id: critical_path_time for node_id in self.elements}
        latest_start: Dict[str, float] = {node_id: critical_path_time for node_id in self.elements}
        for node_id in reversed(order):
            node = self.elements[node_id]
            duration = self.effective_ee_time(node)
            succs = graph[node_id]
            if succs:
                latest_finish[node_id] = min(latest_start[s] for s in succs)
            latest_start[node_id] = latest_finish[node_id] - duration

        slack = {
            node_id: round(latest_start[node_id] - earliest_start[node_id], 2)
            for node_id in self.elements
        }
        return round(critical_path_time, 2), earliest_start, earliest_finish, slack

    def parallel_metrics(self) -> ParallelInfo:
        sequential = self.total_ee_time()
        critical_path_time, _, _, _ = self._critical_path_metrics()
        saved = round(sequential - critical_path_time, 2)
        ratio = round(critical_path_time / sequential, 2) if sequential > 0 else 0.0
        return ParallelInfo(
            sequential_time=sequential,
            parallel_time=critical_path_time,
            time_saved=saved,
            efficiency_ratio=ratio,
        )

    def bottlenecks(self) -> List[BottleneckInfo]:
        critical_path_time, earliest_start, earliest_finish, slack = self._critical_path_metrics()
        result: List[BottleneckInfo] = []
        for node_id, node in self.elements.items():
            node_slack = slack.get(node_id, 0.0)
            # Bottleneck: zero slack and lies on a longest path from start to end.
            is_bottleneck = (
                abs(node_slack) < 0.001
                and node.ee_time > 0
                and earliest_start.get(node_id, 0) + node.ee_time + (critical_path_time - earliest_finish.get(node_id, 0)) == critical_path_time
            )
            result.append(BottleneckInfo(
                element_id=node_id,
                element_name=node.name or node_id,
                ee_time=node.ee_time,
                slack=round(node_slack, 2),
                is_bottleneck=is_bottleneck,
            ))
        return result

    def utilization(self) -> List[UtilizationInfo]:
        parallel_time = self.parallel_metrics().parallel_time
        result: List[UtilizationInfo] = []
        for node in self.time_contributing_elements():
            ee = self.effective_ee_time(node)
            rate = round(ee / parallel_time, 4) if parallel_time > 0 else 0.0
            result.append(UtilizationInfo(
                element_id=node.id,
                element_name=node.name or node.id,
                ee_time=ee,
                process_parallel_time=parallel_time,
                utilization_rate=rate,
            ))
        return result

    # ------------------------------------------------------------------
    # Ingredients
    # ------------------------------------------------------------------

    def _numeric_ingredient_properties(self) -> Iterable[Tuple[BpmnElement, str, float, str]]:
        for node in self.elements.values():
            if node.tag not in _TASK_TAGS:
                continue
            for name, value in node.properties.items():
                if not name.startswith("ingredient_"):
                    continue
                # Skip the special "ingredient" (name without suffix) and meta keys.
                base = name[len("ingredient_"):]
                if not base or base in ("value", "um"):
                    continue
                quantity = parse_recalc_number(value)
                if quantity is None:
                    continue
                unit = node.properties.get(f"ingredient_{base}_unit", "")
                yield node, base, quantity, unit

    def ingredients(self) -> Tuple[List[IngredientSummary], List[IngredientDetail]]:
        summary: Dict[str, Dict[str, float]] = {}
        detail: List[IngredientDetail] = []
        for node, ingredient_name, quantity, unit in self._numeric_ingredient_properties():
            info = summary.setdefault(ingredient_name, {"total": 0.0, "unit": unit})
            info["total"] += quantity
            detail.append(IngredientDetail(
                element_id=node.id,
                element_name=node.name or node.id,
                ingredient_name=ingredient_name,
                quantity=round(quantity, 2),
                unit=unit,
            ))

        summary_rows = [
            IngredientSummary(
                ingredient_name=name,
                total_quantity=round(info["total"], 2),
                unit=info["unit"],
            )
            for name, info in sorted(summary.items())
        ]
        return summary_rows, detail

    # ------------------------------------------------------------------
    # Resources
    # ------------------------------------------------------------------

    def resources(self) -> List[ResourceInfo]:
        totals: Dict[str, List[float]] = {}
        for node in self.elements.values():
            if node.tag not in _TASK_TAGS:
                continue
            for name, value in node.properties.items():
                if not (name.startswith("resource_") or name.startswith("capacity_")):
                    continue
                resource_name = name
                quantity = parse_recalc_number(value)
                if quantity is None:
                    continue
                totals.setdefault(resource_name, []).append(quantity)

        if not totals:
            return []

        return [
            ResourceInfo(
                resource_name=name,
                peak_consumption=round(max(values), 2),
                total_consumption=round(sum(values), 2),
                unit="",
            )
            for name, values in sorted(totals.items())
        ]

    # ------------------------------------------------------------------
    # Coverage
    # ------------------------------------------------------------------

    def coverage(
        self,
        required_keys: Optional[List[str]] = None,
        optional_prefixes: Optional[Tuple[str, ...]] = None,
    ) -> Tuple[List[CoverageInfo], CoverageSummary]:
        required = required_keys or _REQUIRED_COVERAGE_KEYS
        optional_prefixes = optional_prefixes or _OPTIONAL_COVERAGE_PREFIXES

        rows: List[CoverageInfo] = []
        complete_count = 0
        total_score = 0.0
        with_ee_time = 0

        for node in self.all_flow_nodes():
            filled = 0
            checks: Dict[str, bool] = {}
            for key in required:
                has = bool(text(node.properties.get(key)))
                checks[key] = has
                if has:
                    filled += 1

            has_optional = any(
                name.startswith(prefix) and text(value)
                for prefix in optional_prefixes
                for name, value in node.properties.items()
            )
            score = round(filled / len(required) * 100, 2) if required else 100.0
            is_complete = filled == len(required) and has_optional
            if is_complete:
                complete_count += 1
            total_score += score
            if node.ee_time > 0:
                with_ee_time += 1

            rows.append(CoverageInfo(
                element_id=node.id,
                element_name=node.name or node.id,
                element_type=node.display_type,
                ee_time_present=checks.get("ee_time", False),
                operation_code_present=checks.get("operation_code", False),
                display_name_present=checks.get("display_name", False),
                recipe_context_present=checks.get("recipe_context", False),
                params_present=checks.get("params", False),
                allowed_outputs_present=checks.get("allowed_outputs", False),
                coverage_score=score,
                is_complete=is_complete,
            ))

        total = len(rows)
        summary = CoverageSummary(
            total_elements=total,
            elements_with_ee_time=with_ee_time,
            elements_without_ee_time=total - with_ee_time,
            average_coverage_score=round(total_score / max(total, 1), 2),
            complete_elements_count=complete_count,
            incomplete_elements_count=total - complete_count,
        )
        return rows, summary

    # ------------------------------------------------------------------
    # Full result
    # ------------------------------------------------------------------

    def calculate(self) -> AdvancedCalculationResult:
        paths = self.all_paths()
        max_path_time = max((p.total_ee_time for p in paths), default=0.0)
        for p in paths:
            p.is_critical = abs(p.total_ee_time - max_path_time) < 0.001

        subprocesses = self.subprocess_summary()
        parallel = self.parallel_metrics()
        bottlenecks = self.bottlenecks()
        utilization = self.utilization()
        ingredients_summary, ingredients_detail = self.ingredients()
        resources = self.resources()
        coverage, coverage_summary = self.coverage()

        elements: List[Dict[str, Any]] = []
        for node in self.all_flow_nodes():
            elements.append({
                "element_id": node.id,
                "element_name": node.name or node.id,
                "element_type": node.display_type,
                "ee_time": node.ee_time,
                "properties": dict(node.properties),
            })

        return AdvancedCalculationResult(
            total_ee_time=self.total_ee_time(),
            subprocesses=subprocesses,
            paths=paths,
            parallel=parallel,
            bottlenecks=bottlenecks,
            utilization=utilization,
            ingredients_summary=ingredients_summary,
            ingredients_detail=ingredients_detail,
            resources=resources,
            coverage=coverage,
            coverage_summary=coverage_summary,
            elements=elements,
            warnings=list(self.warnings),
        )
