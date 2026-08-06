// Z1 TOBE-UX — единый источник структурных блоков палитры (развилки/события).
// Подписи — через t() (i18n ru/en), без RU-hardcode в компонентах.
// Вызывать в теле компонента (label разрешается в текущей локали).
import { t } from "../i18n";

export function getStructuralBlocks({ withIntermediate = false } = {}) {
  const blocks = [
    { bpmn_type: "exclusiveGateway", label: t("ctor.block.exclusiveGateway"), prefix: "Gateway", width: 60, height: 60 },
    { bpmn_type: "parallelGateway", label: t("ctor.block.parallelGateway"), prefix: "Gateway", width: 60, height: 60 },
    { bpmn_type: "startEvent", label: t("ctor.block.startEvent"), prefix: "StartEvent", width: 40, height: 40 },
    { bpmn_type: "endEvent", label: t("ctor.block.endEvent"), prefix: "EndEvent", width: 40, height: 40 },
  ];
  if (withIntermediate) {
    blocks.push({ bpmn_type: "intermediateCatchEvent", label: t("ctor.block.intermediateCatchEvent"), prefix: "IntermediateEvent", width: 40, height: 40 });
  }
  return blocks;
}
