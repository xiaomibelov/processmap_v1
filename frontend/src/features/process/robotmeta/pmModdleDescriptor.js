export const PM_ROBOT_META_NAMESPACE = "http://processmap.ai/schema/bpmn/1.0";
export const PM_ROBOT_META_PREFIX = "pm";

const pmModdleDescriptor = {
  name: "ProcessMap",
  uri: PM_ROBOT_META_NAMESPACE,
  prefix: PM_ROBOT_META_PREFIX,
  types: [
    {
      name: "RobotMeta",
      superClass: ["Element"],
      properties: [
        {
          name: "version",
          isAttr: true,
          type: "String",
        },
        {
          name: "json",
          isBody: true,
          type: "String",
        },
      ],
    },
    {
      // Элементный provenance TO BE (fix/tobe-element-provenance-persistence-v1):
      // derived_from — массив id AS IS-элементов (consolidated N→1).
      name: "Trace",
      superClass: ["Element"],
      properties: [
        {
          name: "derived_from",
          isMany: true,
          type: "String",
        },
        {
          name: "fate",
          isAttr: true,
          type: "String",
        },
        {
          name: "rule_id",
          isAttr: true,
          type: "String",
        },
      ],
    },
  ],
};

export default pmModdleDescriptor;
