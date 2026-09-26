// geometryApplyRealLagmanLabels.mjs — реальные DI-labels (bpmndi:BPMNLabel/dc:Bounds)
// golden-фикстуры «Лагман» (контур fix/canvas-geometry-labels-follow).
//
// Источник: evidence/lagman-v387.xml контура fix/canvas-geometry-real-golden-fixture
// (stage-БД, bpmn_versions v387, та же выгрузка, что и geometryApplyRealLagman.mjs).
// Экстракт: BPMNShape/BPMNEdge → di.label.bounds; только id, присутствующие в
// фикстуре «Лагман»; координаты as-is (float, bpmn-js стиль).

export const nodeLabels = {
  "Event_18w7id0": {
    "x": 448.0,
    "y": 290.0,
    "width": 85.0,
    "height": 40.0
  },
  "Event_0kkmo7n": {
    "x": 367.0,
    "y": 486.0,
    "width": 85.0,
    "height": 27.0
  },
  "Gateway_1cf96y5": {
    "x": 609.0,
    "y": 913.0,
    "width": 63.0,
    "height": 53.0
  },
  "Gateway_0zg6re9": {
    "x": 778.0,
    "y": 863.0,
    "width": 63.0,
    "height": 53.0
  },
  "Gateway_0zzg2xj": {
    "x": 1143.0,
    "y": 837.5,
    "width": 53.0,
    "height": 27.0
  },
  "Gateway_1bemc3f": {
    "x": 1215.0,
    "y": 399.0,
    "width": 70.0,
    "height": 66.0
  },
  "Gateway_1yiacd4": {
    "x": 1394.0,
    "y": 642.0,
    "width": 73.0,
    "height": 40.0
  },
  "Gateway_1kl72h3": {
    "x": 3993.0,
    "y": 437.5,
    "width": 74.0,
    "height": 27.0
  },
  "Gateway_16aa5c2": {
    "x": 4666.0,
    "y": 411.5,
    "width": 87.0,
    "height": 53.0
  },
  "Gateway_1qzft9o": {
    "x": 5008.0,
    "y": 552.0,
    "width": 84.0,
    "height": 40.0
  },
  "Gateway_08d2l5f": {
    "x": 5841.0,
    "y": 558.5,
    "width": 58.0,
    "height": 27.0
  },
  "Gateway_12jc8w3": {
    "x": 6585.0,
    "y": 381.0,
    "width": 90.0,
    "height": 14.0
  },
  "Gateway_0o671nj": {
    "x": 6775.0,
    "y": 583.0,
    "width": 89.0,
    "height": 14.0
  },
  "Event_1n46r9w": {
    "x": 9431.0,
    "y": 585.0,
    "width": 83.0,
    "height": 27.0
  },
  "Gateway_08nkv04": {
    "x": 825.5,
    "y": 927.0,
    "width": 69.0,
    "height": 14.0
  },
  "Gateway_020hgsi": {
    "x": 835.5,
    "y": 397.0,
    "width": 69.0,
    "height": 14.0
  },
  "Event_0o5hi0x": {
    "x": 388.0,
    "y": 391.0,
    "width": 84.0,
    "height": 40.0
  },
  "Event_0jb6acb": {
    "x": 1009.0,
    "y": 759.0,
    "width": 86.0,
    "height": 27.0
  },
  "Gateway_1ggot16": {
    "x": 1659.0,
    "y": 657.5,
    "width": 77.0,
    "height": 27.0
  },
  "Gateway_00sv5kg": {
    "x": 2022.0,
    "y": 752.0,
    "width": 72.0,
    "height": 40.0
  },
  "Gateway_1bn5itv": {
    "x": 2262.0,
    "y": 752.0,
    "width": 73.0,
    "height": 27.0
  },
  "Gateway_07245n1": {
    "x": 2705.0,
    "y": 261.0,
    "width": 86.0,
    "height": 14.0
  },
  "Event_1vloo7b": {
    "x": 2742.0,
    "y": 759.0,
    "width": 51.0,
    "height": 27.0
  },
  "Event_1g5pk5b": {
    "x": 707.0,
    "y": 681.0,
    "width": 86.0,
    "height": 27.0
  },
  "Gateway_0uue82x": {
    "x": 1429.0,
    "y": 613.5,
    "width": 77.0,
    "height": 27.0
  },
  "Gateway_0j8zu62": {
    "x": 1833.0,
    "y": 708.0,
    "width": 72.0,
    "height": 40.0
  },
  "Gateway_0dj9gz1": {
    "x": 2143.5,
    "y": 662.0,
    "width": 73.0,
    "height": 27.0
  },
  "Event_1j333xd": {
    "x": 2553.0,
    "y": 754.0,
    "width": 51.0,
    "height": 27.0
  },
  "Gateway_0kk3mw8": {
    "x": 2740.0,
    "y": 262.0,
    "width": 86.0,
    "height": 14.0
  }
};

export const connectionLabels = {
  "Flow_0xf353n": {
    "x": 664.0,
    "y": 1065.0,
    "width": 52.0,
    "height": 14.0
  },
  "Flow_0o7mtdo": {
    "x": 1224.0,
    "y": 882.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_1hafwue": {
    "x": 949.0,
    "y": 1072.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_0jukydn": {
    "x": 1255.0,
    "y": 565.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0dhpsde": {
    "x": 4085.0,
    "y": 482.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_1tgsnc4": {
    "x": 4039.0,
    "y": 565.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_0yocx37": {
    "x": 4741.0,
    "y": 466.0,
    "width": 84.0,
    "height": 27.0
  },
  "Flow_0h0hq0z": {
    "x": 4725.0,
    "y": 576.0,
    "width": 89.0,
    "height": 27.0
  },
  "Flow_1ngq0rj": {
    "x": 5116.0,
    "y": 592.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_08trot5": {
    "x": 5425.0,
    "y": 692.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0xxdor6": {
    "x": 6676.0,
    "y": 412.0,
    "width": 14.0,
    "height": 14.0
  },
  "Flow_0dk99f6": {
    "x": 6673.0,
    "y": 493.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0pvhyho": {
    "x": 6821.0,
    "y": 532.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_19d71cy": {
    "x": 6765.0,
    "y": 615.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0cvxfsg": {
    "x": 7673.0,
    "y": -28.0,
    "width": 60.0,
    "height": 40.0
  },
  "Flow_0exqsnp": {
    "x": 8748.0,
    "y": 492.0,
    "width": 83.0,
    "height": 53.0
  },
  "Flow_14auc25": {
    "x": 7485.0,
    "y": 290.0,
    "width": 89.0,
    "height": 40.0
  },
  "Flow_1ebij9b": {
    "x": 670.0,
    "y": 509.0,
    "width": 60.0,
    "height": 27.0
  },
  "Flow_0nlltaw": {
    "x": 780.0,
    "y": 298.0,
    "width": 73.0,
    "height": 14.0
  },
  "Flow_0yjtrmw": {
    "x": 667.0,
    "y": 794.0,
    "width": 46.0,
    "height": 27.0
  },
  "Flow_08zj4w1": {
    "x": 801.0,
    "y": 989.0,
    "width": 32.0,
    "height": 14.0
  },
  "Flow_0rlg5hh": {
    "x": 803.0,
    "y": 843.0,
    "width": 73.0,
    "height": 14.0
  },
  "Flow_0r6lubq": {
    "x": 800.0,
    "y": 473.0,
    "width": 32.0,
    "height": 14.0
  },
  "Flow_0x068qr": {
    "x": 1041.0,
    "y": 308.0,
    "width": 59.0,
    "height": 27.0
  },
  "Flow_03t5l9s": {
    "x": 940.0,
    "y": 608.0,
    "width": 59.0,
    "height": 27.0
  },
  "Flow_0f11vra": {
    "x": 1110.0,
    "y": 886.0,
    "width": 59.0,
    "height": 27.0
  },
  "Flow_07kbbpn": {
    "x": 940.0,
    "y": 1146.0,
    "width": 59.0,
    "height": 27.0
  },
  "Flow_1c4vgak": {
    "x": 1702.0,
    "y": 760.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_06z3hw3": {
    "x": 2545.0,
    "y": 724.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_1wom781": {
    "x": 1941.0,
    "y": 702.0,
    "width": 68.0,
    "height": 14.0
  },
  "Flow_04s9py7": {
    "x": 1755.0,
    "y": 702.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0z4rens": {
    "x": 2322.0,
    "y": 502.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_05n2x1c": {
    "x": 2171.0,
    "y": 526.0,
    "width": 65.0,
    "height": 27.0
  },
  "Flow_0ebthlr": {
    "x": 2744.0,
    "y": 488.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_19agx97": {
    "x": 2168.0,
    "y": 702.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_0g3fl3e": {
    "x": 1830.0,
    "y": 774.0,
    "width": 79.0,
    "height": 27.0
  },
  "Flow_0ystb9z": {
    "x": 2799.0,
    "y": 318.0,
    "width": 12.0,
    "height": 14.0
  },
  "Flow_0osl39p": {
    "x": 2040.0,
    "y": 637.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_1q0sykg": {
    "x": 2864.0,
    "y": 316.0,
    "width": 12.0,
    "height": 14.0
  },
  "Flow_1sh7jxc": {
    "x": 1596.0,
    "y": 750.0,
    "width": 79.0,
    "height": 27.0
  },
  "Flow_1hkyzyg": {
    "x": 1981.0,
    "y": 496.0,
    "width": 65.0,
    "height": 27.0
  },
  "Flow_024vnvy": {
    "x": 1545.0,
    "y": 666.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_00a2os2": {
    "x": 1979.0,
    "y": 658.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_1qvj1ga": {
    "x": 2118.0,
    "y": 471.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_0f4ddxy": {
    "x": 2753.0,
    "y": 392.0,
    "width": 20.0,
    "height": 14.0
  },
  "Flow_1kxoo03": {
    "x": 1472.0,
    "y": 727.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_1ct5v24": {
    "x": 1851.0,
    "y": 606.0,
    "width": 13.0,
    "height": 14.0
  },
  "Flow_06b129s": {
    "x": 1751.0,
    "y": 666.0,
    "width": 68.0,
    "height": 14.0
  },
  "Flow_1kdjvfh": {
    "x": 2114.0,
    "y": 712.0,
    "width": 20.0,
    "height": 14.0
  }
};
