// Minimal Zeebe moddle descriptor, mirroring the local camunda descriptor shape
// so bpmn-js materializes `zeebe:Properties` / `zeebe:Property` into the
// businessObject (instead of round-tripping raw XML). Kept intentionally small
// (Properties/Property only) to limit blast radius.
const zeebeModdleDescriptor = {
  name: "Zeebe",
  uri: "http://camunda.org/schema/zeebe/1.0",
  prefix: "zeebe",
  xml: {
    tagAlias: "lowerCase",
  },
  associations: [],
  types: [
    {
      name: "Properties",
      superClass: ["Element"],
      meta: {
        allowedIn: ["*"],
      },
      properties: [
        {
          name: "values",
          type: "Property",
          isMany: true,
        },
      ],
    },
    {
      name: "Property",
      superClass: ["Element"],
      properties: [
        {
          name: "name",
          type: "String",
          isAttr: true,
        },
        {
          name: "value",
          type: "String",
          isAttr: true,
        },
      ],
    },
  ],
  emumerations: [],
};

export default zeebeModdleDescriptor;
