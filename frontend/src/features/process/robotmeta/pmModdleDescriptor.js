export const PM_ROBOT_META_NAMESPACE = "http://processmap.ai/schema/bpmn/1.0";
export const PM_ROBOT_META_PREFIX = "pm";

const pmModdleDescriptor = {
  name: "ProcessMap",
  uri: PM_ROBOT_META_NAMESPACE,
  prefix: PM_ROBOT_META_PREFIX,
  xml: {
    tagAlias: "lowerCase",
  },
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
  ],
};

export default pmModdleDescriptor;
