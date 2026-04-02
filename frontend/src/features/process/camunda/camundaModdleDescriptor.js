const camundaModdleDescriptor = {
  name: "Camunda",
  uri: "http://camunda.org/schema/1.0/bpmn",
  prefix: "camunda",
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
    {
      name: "ExecutionListener",
      superClass: ["Element"],
      meta: {
        allowedIn: [
          "bpmn:Task",
          "bpmn:ServiceTask",
          "bpmn:UserTask",
          "bpmn:BusinessRuleTask",
          "bpmn:ScriptTask",
          "bpmn:ReceiveTask",
          "bpmn:ManualTask",
          "bpmn:ExclusiveGateway",
          "bpmn:SequenceFlow",
          "bpmn:ParallelGateway",
          "bpmn:InclusiveGateway",
          "bpmn:EventBasedGateway",
          "bpmn:StartEvent",
          "bpmn:IntermediateCatchEvent",
          "bpmn:IntermediateThrowEvent",
          "bpmn:EndEvent",
          "bpmn:BoundaryEvent",
          "bpmn:CallActivity",
          "bpmn:SubProcess",
          "bpmn:Process",
        ],
      },
      properties: [
        {
          name: "expression",
          isAttr: true,
          type: "String",
        },
        {
          name: "class",
          isAttr: true,
          type: "String",
        },
        {
          name: "delegateExpression",
          isAttr: true,
          type: "String",
        },
        {
          name: "event",
          isAttr: true,
          type: "String",
        },
      ],
    },
  ],
  emumerations: [],
};

export default camundaModdleDescriptor;
