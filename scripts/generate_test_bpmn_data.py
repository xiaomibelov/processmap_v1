#!/usr/bin/env python3
"""Generate synthetic BPMN test data and insert into local SQLite DB."""

import sqlite3
import time
import uuid
import xml.etree.ElementTree as ET

DB_PATH = "backend/workspace/.session_store/processmap.sqlite3"

def generate_small_bpmn():
    """Small diagram: 9 BPMN elements (Start, 2 Tasks, End, 3 Flows, 2 shapes for gateways approx)."""
    return '''<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_start_gateway</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_no">
      <bpmn:incoming>Flow_start_gateway</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_yes">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_yes_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_no">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_no_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gateway" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="Task_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="Task_no" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="End_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <omgdc:Bounds x="152" y="152" width="36" height="36" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1">
        <omgdc:Bounds x="250" y="145" width="50" height="50" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_yes_di" bpmnElement="Task_yes">
        <omgdc:Bounds x="360" y="80" width="100" height="80" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_no_di" bpmnElement="Task_no">
        <omgdc:Bounds x="360" y="190" width="100" height="80" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <omgdc:Bounds x="520" y="152" width="36" height="36" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_gateway_di" bpmnElement="Flow_start_gateway">
        <omgdi:waypoint x="188" y="170" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
        <omgdi:waypoint x="250" y="170" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_yes_di" bpmnElement="Flow_yes">
        <omgdi:waypoint x="275" y="145" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
        <omgdi:waypoint x="360" y="120" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_no_di" bpmnElement="Flow_no">
        <omgdi:waypoint x="275" y="195" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
        <omgdi:waypoint x="360" y="230" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_yes_end_di" bpmnElement="Flow_yes_end">
        <omgdi:waypoint x="460" y="120" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
        <omgdi:waypoint x="520" y="170" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_no_end_di" bpmnElement="Flow_no_end">
        <omgdi:waypoint x="460" y="230" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
        <omgdi:waypoint x="520" y="170" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>'''

def generate_large_bpmn(num_tasks=200):
    """Generate a large BPMN diagram with ~428 elements (num_tasks shapes + num_tasks+ connections + start/end)."""
    ns = {"bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL"}
    root = ET.Element("{http://www.omg.org/spec/BPMN/20100524/MODEL}definitions", {
        "id": "Definitions_large",
        "targetNamespace": "http://bpmn.io/schema/bpmn"
    })
    proc = ET.SubElement(root, "{http://www.omg.org/spec/BPMN/20100524/MODEL}process", {
        "id": "Process_large", "isExecutable": "false"
    })
    
    # Start event
    start = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}startEvent", {"id": "Start_0"})
    ET.SubElement(start, "{http://www.omg.org/spec/BPMN/20100524/MODEL}outgoing").text = "Flow_start_0"
    
    prev_id = "Start_0"
    flow_ids = []
    task_ids = []
    
    for i in range(num_tasks):
        task_id = f"Task_{i}"
        task_ids.append(task_id)
        task = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}task", {"id": task_id})
        flow_in = f"Flow_{prev_id}_{task_id}"
        flow_ids.append(flow_in)
        ET.SubElement(task, "{http://www.omg.org/spec/BPMN/20100524/MODEL}incoming").text = flow_in
        flow_out = f"Flow_{task_id}_next"
        ET.SubElement(task, "{http://www.omg.org/spec/BPMN/20100524/MODEL}outgoing").text = flow_out
        
        # Sequence flow from prev to task
        sf = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": flow_in, "sourceRef": prev_id, "targetRef": task_id
        })
        prev_id = task_id
    
    # End event
    end_id = "End_final"
    end = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}endEvent", {"id": end_id})
    last_flow = f"Flow_{prev_id}_{end_id}"
    flow_ids.append(last_flow)
    ET.SubElement(end, "{http://www.omg.org/spec/BPMN/20100524/MODEL}incoming").text = last_flow
    sf = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
        "id": last_flow, "sourceRef": prev_id, "targetRef": end_id
    })
    
    # Add some parallel branches for complexity
    branch_points = [10, 30, 60, 100, 150]
    for bp in branch_points:
        if bp >= num_tasks:
            continue
        branch_task = f"Task_{bp}"
        branch_target = f"Task_branch_{bp}"
        task_ids.append(branch_target)
        task = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}task", {"id": branch_target})
        branch_flow = f"Flow_branch_{bp}"
        flow_ids.append(branch_flow)
        ET.SubElement(task, "{http://www.omg.org/spec/BPMN/20100524/MODEL}incoming").text = branch_flow
        return_flow = f"Flow_branch_return_{bp}"
        ET.SubElement(task, "{http://www.omg.org/spec/BPMN/20100524/MODEL}outgoing").text = return_flow
        sf1 = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": branch_flow, "sourceRef": branch_task, "targetRef": branch_target
        })
        return_target = f"Task_{bp+1}" if bp+1 < num_tasks else end_id
        sf2 = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": return_flow, "sourceRef": branch_target, "targetRef": return_target
        })
        flow_ids.append(return_flow)
    
    # Add some gateways
    gw_positions = [25, 75, 125, 175]
    for gp in gw_positions:
        if gp >= num_tasks:
            continue
        gw_id = f"Gateway_{gp}"
        gw = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}exclusiveGateway", {"id": gw_id})
        gw_in = f"Flow_gw_in_{gp}"
        gw_out1 = f"Flow_gw_out1_{gp}"
        gw_out2 = f"Flow_gw_out2_{gp}"
        flow_ids.extend([gw_in, gw_out1, gw_out2])
        ET.SubElement(gw, "{http://www.omg.org/spec/BPMN/20100524/MODEL}incoming").text = gw_in
        ET.SubElement(gw, "{http://www.omg.org/spec/BPMN/20100524/MODEL}outgoing").text = gw_out1
        ET.SubElement(gw, "{http://www.omg.org/spec/BPMN/20100524/MODEL}outgoing").text = gw_out2
        sf_in = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": gw_in, "sourceRef": f"Task_{gp-1}", "targetRef": gw_id
        })
        sf_out1 = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": gw_out1, "sourceRef": gw_id, "targetRef": f"Task_{gp}"
        })
        target2 = f"Task_{gp+5}" if gp+5 < num_tasks else end_id
        sf_out2 = ET.SubElement(proc, "{http://www.omg.org/spec/BPMN/20100524/MODEL}sequenceFlow", {
            "id": gw_out2, "sourceRef": gw_id, "targetRef": target2
        })
    
    # BPMNDI
    di = ET.SubElement(root, "{http://www.omg.org/spec/BPMN/20100524/DI}BPMNDiagram", {"id": "BPMNDiagram_large"})
    plane = ET.SubElement(di, "{http://www.omg.org/spec/BPMN/20100524/DI}BPMNPlane", {"id": "BPMNPlane_large", "bpmnElement": "Process_large"})
    
    dc_ns = "{http://www.omg.org/spec/DD/20100524/DC}"
    di_ns = "{http://www.omg.org/spec/DD/20100524/DI}"
    
    def add_shape(element_id, x, y, w, h):
        shape = ET.SubElement(plane, "{http://www.omg.org/spec/BPMN/20100524/DI}BPMNShape", {"id": f"{element_id}_di", "bpmnElement": element_id})
        ET.SubElement(shape, dc_ns + "Bounds", {"x": str(x), "y": str(y), "width": str(w), "height": str(h)})
    
    def add_edge(flow_id, x1, y1, x2, y2):
        edge = ET.SubElement(plane, "{http://www.omg.org/spec/BPMN/20100524/DI}BPMNEdge", {"id": f"{flow_id}_di", "bpmnElement": flow_id})
        ET.SubElement(edge, di_ns + "waypoint", {"x": str(x1), "y": str(y1)})
        ET.SubElement(edge, di_ns + "waypoint", {"x": str(x2), "y": str(y2)})
    
    add_shape("Start_0", 100, 100, 36, 36)
    x, y = 200, 100
    row = 0
    for i, tid in enumerate(task_ids):
        if "branch" in tid:
            add_shape(tid, x + 200, y + 150, 100, 80)
            add_edge(f"Flow_branch_{tid.split('_')[2]}", x + 100, y + 40, x + 200, y + 150)
            add_edge(f"Flow_branch_return_{tid.split('_')[2]}", x + 200, y + 230, x + 100, y + 80)
        elif tid.startswith("Gateway_"):
            add_shape(tid, x, y, 50, 50)
            add_edge(f"Flow_gw_in_{tid.split('_')[1]}", x - 100, y + 40, x, y + 25)
            add_edge(f"Flow_gw_out1_{tid.split('_')[1]}", x + 50, y + 25, x + 100, y + 40)
            add_edge(f"Flow_gw_out2_{tid.split('_')[1]}", x + 25, y + 50, x + 25, y + 150)
            x += 150
        else:
            add_shape(tid, x, y, 100, 80)
            if i == 0:
                add_edge("Flow_start_0", 136, 118, x, y + 40)
            else:
                prev = task_ids[i-1] if i > 0 else "Start_0"
                if "branch" not in prev and not prev.startswith("Gateway_"):
                    add_edge(f"Flow_{prev}_{tid}", x - 50, y + 40, x, y + 40)
            x += 150
            if x > 3000:
                x = 200
                y += 200
                row += 1
    
    add_shape("End_final", x + 50, y + 22, 36, 36)
    add_edge(f"Flow_{prev_id}_End_final", x, y + 40, x + 50, y + 40)
    
    # Register namespaces for pretty output
    ET.register_namespace('bpmn', 'http://www.omg.org/spec/BPMN/20100524/MODEL')
    ET.register_namespace('bpmndi', 'http://www.omg.org/spec/BPMN/20100524/DI')
    ET.register_namespace('omgdc', 'http://www.omg.org/spec/DD/20100524/DC')
    ET.register_namespace('omgdi', 'http://www.omg.org/spec/DD/20100524/DI')
    
    xml_str = ET.tostring(root, encoding='unicode')
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str
    return xml_str

def count_bpmn_elements(xml_str):
    """Count BPMN elements (shapes + connections + labels etc)."""
    root = ET.fromstring(xml_str)
    # Count all elements with ids
    count = 0
    for elem in root.iter():
        if elem.get('id'):
            count += 1
    return count

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = int(time.time())
    
    # Ensure org exists
    cursor.execute("INSERT OR IGNORE INTO orgs (id, name, created_at, created_by) VALUES (?, ?, ?, ?)",
                   ("org_default", "Default Org", now, "admin-1779660562"))
    
    # Ensure workspace exists
    cursor.execute("INSERT OR IGNORE INTO workspaces (id, org_id, name, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
                   ("ws_org_default_main", "org_default", "Main", now, "admin-1779660562"))
    
    # Create a folder
    folder_id = "folder_test_1"
    cursor.execute("INSERT OR IGNORE INTO workspace_folders (id, org_id, workspace_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (folder_id, "org_default", "ws_org_default_main", "Test Folder", "admin-1779660562", now))
    
    # Create a project
    project_id = "proj_test_1"
    cursor.execute("INSERT OR IGNORE INTO projects (id, title, created_at, updated_at, owner_user_id, org_id, created_by, updated_by, folder_id, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (project_id, "Test Project", now, now, "admin-1779660562", "org_default", "admin-1779660562", "admin-1779660562", folder_id, "ws_org_default_main"))
    
    # Add org membership
    cursor.execute("INSERT OR IGNORE INTO org_memberships (user_id, org_id, role, created_at) VALUES (?, ?, ?, ?)",
                   ("admin-1779660562", "org_default", "admin", now))
    
    # Add project membership
    cursor.execute("INSERT OR IGNORE INTO project_memberships (user_id, project_id, role, created_at) VALUES (?, ?, ?, ?)",
                   ("admin-1779660562", project_id, "owner", now))
    
    # Generate BPMN XML
    small_xml = generate_small_bpmn()
    large_xml = generate_large_bpmn(num_tasks=180)  # ~180 tasks + gateways + branches = ~400+ elements
    
    small_count = count_bpmn_elements(small_xml)
    large_count = count_bpmn_elements(large_xml)
    print(f"Small diagram elements: {small_count}")
    print(f"Large diagram elements: {large_count}")
    print(f"Small XML size: {len(small_xml)} bytes")
    print(f"Large XML size: {len(large_xml)} bytes")
    
    # Create sessions
    sessions = [
        ("6318dcf810", "Small Test Diagram", small_xml),
        ("5425e68a8d", "Large Test Diagram", large_xml),
    ]
    
    for sid, title, bpmn_xml in sessions:
        cursor.execute("DELETE FROM sessions WHERE id = ?", (sid,))
        cursor.execute('''INSERT INTO sessions 
            (id, title, roles_json, start_role, project_id, mode, notes, notes_by_element_json,
             interview_json, nodes_json, edges_json, questions_json, mermaid, mermaid_simple,
             mermaid_lanes, normalized_json, resources_json, analytics_json, ai_llm_state_json,
             bpmn_xml, bpmn_xml_version, diagram_state_version, diagram_last_write_actor_user_id,
             diagram_last_write_actor_label, diagram_last_write_at, diagram_last_write_changed_keys_json,
             bpmn_graph_fingerprint, git_mirror_version_number, bpmn_meta_json, version,
             owner_user_id, org_id, created_by, updated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (sid, title, '["cook_1","technolog"]', "cook_1", project_id, "quick_skeleton", "",
             "'{}'", "'{}'", "'[]'", "'[]'", "'[]'", "", "", "", "'{}'", "'{}'", "'{}'", "'{}'",
             bpmn_xml, 1, 0, "", "", 0, "'[]'", "", 0, "'{}'", 1,
             "admin-1779660562", "org_default", "admin-1779660562", "admin-1779660562", now, now))
    
    conn.commit()
    conn.close()
    print("Test data inserted successfully.")

if __name__ == "__main__":
    main()
