// geometryApplyRealLagman.mjs — REAL golden-фикстура контура
// fix/canvas-geometry-real-golden-fixture.
//
// Источник: stage-БД, bpmn_versions v387 сессии «Лагман» (project 8af5b6b869,
// session f82250a63a), выгрузка read-only 2026-09-25 (evidence/lagman-v387.xml).
// Конвертация одноразовым скриптом — зеркало экстрактора computeGeometryApplyPlanFromRegistry
// (BpmnStage.jsx): типы bpmn-js-стилем (Task/ManualTask/ExclusiveGateway/StartEvent/
// BoundaryEvent), laneKey/laneBounds из lane/pool containment (flowNodeRef),
// attachedTo из attachedToRef, connections — только flow с DI-waypoints
// (sequenceFlows + messageFlows, kind помечен).
//
// ОБЕЗЛИЧИВАНИЕ: фикстура несёт только геометрию — имена задач/лайнов/участников
// в формат входа не входят и НЕ выгружены; проверка XML на персональные данные
// (email/телефоны/ФИО/организации) — 0 совпадений (см. REPORT.md).

export const nodes = [
    {
      "id": "Event_18w7id0",
      "type": "startEvent",
      "x": 472,
      "y": 342,
      "width": 36,
      "height": 36,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Event_0kkmo7n",
      "type": "intermediateCatchEvent",
      "x": 472,
      "y": 482,
      "width": 36,
      "height": 36,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0ecrgua",
      "type": "userTask",
      "x": 440,
      "y": 630,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0cyj686",
      "type": "userTask",
      "x": 440,
      "y": 1100,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_1jaf7uo",
      "type": "manualTask",
      "x": 590,
      "y": 1100,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Gateway_1cf96y5",
      "type": "exclusiveGateway",
      "x": 615,
      "y": 985,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Gateway_1fbll4e",
      "type": "exclusiveGateway",
      "x": 715,
      "y": 985,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_0kk3jez",
      "type": "manualTask",
      "x": 820,
      "y": 970,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Gateway_0zg6re9",
      "type": "exclusiveGateway",
      "x": 845,
      "y": 865,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_165w0qp",
      "type": "userTask",
      "x": 970,
      "y": 860,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Gateway_0zzg2xj",
      "type": "exclusiveGateway",
      "x": 1145,
      "y": 875,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Event_0yo3h7z",
      "type": "endEvent",
      "x": 1272,
      "y": 882,
      "width": 36,
      "height": 36,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_11ez4hx",
      "type": "manualTask",
      "x": 1020,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_1bemc3f",
      "type": "exclusiveGateway",
      "x": 1225,
      "y": 475,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1k4j03v",
      "type": "manualTask",
      "x": 1380,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_1yiacd4",
      "type": "exclusiveGateway",
      "x": 1405,
      "y": 585,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_06lwhx0",
      "type": "userTask",
      "x": 1620,
      "y": 10,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_1qgja13",
      "type": "manualTask",
      "x": 1870,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1y86glf",
      "type": "userTask",
      "x": 1870,
      "y": 10,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_0p4llny",
      "type": "userTask",
      "x": 2020,
      "y": 10,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_1lphyop",
      "type": "userTask",
      "x": 2020,
      "y": 900,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_0etkgte",
      "type": "manualTask",
      "x": 2180,
      "y": 460,
      "width": 130,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1cxm6js",
      "type": "manualTask",
      "x": 2370,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1rmpcfi",
      "type": "manualTask",
      "x": 2530,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_00gzfh2",
      "type": "userTask",
      "x": 2530,
      "y": 10,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_018evbx",
      "type": "manualTask",
      "x": 2720,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_01fh7t2",
      "type": "userTask",
      "x": 2890,
      "y": 10,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_0rsnima",
      "type": "manualTask",
      "x": 3060,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0xta76p",
      "type": "manualTask",
      "x": 3230,
      "y": 460,
      "width": 160,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1ijfo0l",
      "type": "manualTask",
      "x": 3460,
      "y": 460,
      "width": 130,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1w66mlr",
      "type": "manualTask",
      "x": 3660,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_18u0097",
      "type": "manualTask",
      "x": 3830,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_1kl72h3",
      "type": "exclusiveGateway",
      "x": 4005,
      "y": 475,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_0ogzfhv",
      "type": "exclusiveGateway",
      "x": 4135,
      "y": 475,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0z2tc4a",
      "type": "manualTask",
      "x": 4110,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0jctmxx",
      "type": "manualTask",
      "x": 4270,
      "y": 460,
      "width": 130,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0d3l8t3",
      "type": "manualTask",
      "x": 4490,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_16aa5c2",
      "type": "exclusiveGateway",
      "x": 4685,
      "y": 475,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0uhasv4",
      "type": "manualTask",
      "x": 4830,
      "y": 460,
      "width": 110,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0hrn483",
      "type": "manualTask",
      "x": 5040,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_154k7eo",
      "type": "manualTask",
      "x": 5240,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1hpntdk",
      "type": "manualTask",
      "x": 5440,
      "y": 460,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0zmctxe",
      "type": "manualTask",
      "x": 4830,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_1qzft9o",
      "type": "exclusiveGateway",
      "x": 5025,
      "y": 585,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1rudwfz",
      "type": "manualTask",
      "x": 5170,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0evlt3s",
      "type": "manualTask",
      "x": 5370,
      "y": 570,
      "width": 120,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0ajzxf1",
      "type": "manualTask",
      "x": 5590,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_08d2l5f",
      "type": "exclusiveGateway",
      "x": 5795,
      "y": 585,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1wjzi4h",
      "type": "manualTask",
      "x": 5950,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_140ck0p",
      "type": "manualTask",
      "x": 6160,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0tw6my2",
      "type": "manualTask",
      "x": 6370,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1jr18bj",
      "type": "manualTask",
      "x": 6580,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Gateway_12jc8w3",
      "type": "exclusiveGateway",
      "x": 6605,
      "y": 405,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0v58hzd",
      "type": "subProcess",
      "x": 6710,
      "y": 390,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Event_17cdftw",
      "type": "startEvent",
      "x": 547,
      "y": 616,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_10zr6lk",
      "type": "inclusiveGateway",
      "x": 626,
      "y": 609,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_08nkv04",
      "type": "exclusiveGateway",
      "x": 766,
      "y": 909,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_020hgsi",
      "type": "exclusiveGateway",
      "x": 776,
      "y": 379,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1m0459y",
      "type": "manualTask",
      "x": 851,
      "y": 183,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_18prpj1",
      "type": "manualTask",
      "x": 851,
      "y": 724,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0c5q1qb",
      "type": "task",
      "x": 851,
      "y": 984,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1faaosa",
      "type": "task",
      "x": 876,
      "y": 483,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0pufjk5",
      "type": "manualTask",
      "x": 1021,
      "y": 1140,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_12c94ge",
      "type": "manualTask",
      "x": 1041,
      "y": 601,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_1cb54g5",
      "type": "exclusiveGateway",
      "x": 1046,
      "y": 1014,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0ivdvdg",
      "type": "exclusiveGateway",
      "x": 1066,
      "y": 513,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0ij5omz",
      "type": "manualTask",
      "x": 1051,
      "y": 183,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0ulf2sc",
      "type": "manualTask",
      "x": 1051,
      "y": 724,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1oxngr8",
      "type": "manualTask",
      "x": 1221,
      "y": 880,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1d6o982",
      "type": "manualTask",
      "x": 1120,
      "y": 300,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0tf63z8",
      "type": "exclusiveGateway",
      "x": 1246,
      "y": 754,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0xqiuxz",
      "type": "exclusiveGateway",
      "x": 1256,
      "y": 213,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_14g6xhm",
      "type": "exclusiveGateway",
      "x": 1386,
      "y": 379,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_1u2m1kf",
      "type": "inclusiveGateway",
      "x": 1386,
      "y": 616,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_02r5f5n",
      "type": "exclusiveGateway",
      "x": 1386,
      "y": 754,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1d8sifu",
      "type": "manualTask",
      "x": 1646,
      "y": 601,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_0l6zobm",
      "type": "endEvent",
      "x": 1917,
      "y": 630,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_1uxj946",
      "type": "boundaryEvent",
      "x": 1082,
      "y": 245,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      },
      "attachedTo": "Activity_0ij5omz"
    },
    {
      "id": "Event_0q1ogtz",
      "type": "boundaryEvent",
      "x": 912,
      "y": 545,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      },
      "attachedTo": "Activity_1faaosa"
    },
    {
      "id": "Event_0hakvgr",
      "type": "boundaryEvent",
      "x": 1082,
      "y": 786,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      },
      "attachedTo": "Activity_0ulf2sc"
    },
    {
      "id": "Event_1ruj7lr",
      "type": "boundaryEvent",
      "x": 892,
      "y": 1046,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      },
      "attachedTo": "Activity_0c5q1qb"
    },
    {
      "id": "Gateway_0o671nj",
      "type": "exclusiveGateway",
      "x": 6735,
      "y": 525,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1ioomae",
      "type": "subProcess",
      "x": 6870,
      "y": 510,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Event_0o5hi0x",
      "type": "startEvent",
      "x": 412,
      "y": 348,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0a7fen4",
      "type": "manualTask",
      "x": 540,
      "y": 326,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1lkjitz",
      "type": "manualTask",
      "x": 700,
      "y": 326,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_0jb6acb",
      "type": "startEvent",
      "x": 1034,
      "y": 716,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_08zpg63",
      "type": "manualTask",
      "x": 1058,
      "y": 640,
      "width": 110,
      "height": 90,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_097ouyq",
      "type": "manualTask",
      "x": 1238,
      "y": 650,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0otpcam",
      "type": "manualTask",
      "x": 1428,
      "y": 650,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0iii88j",
      "type": "manualTask",
      "x": 1648,
      "y": 790,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_1ggot16",
      "type": "exclusiveGateway",
      "x": 1673,
      "y": 695,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_00p2rjg",
      "type": "manualTask",
      "x": 1778,
      "y": 650,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_00sv5kg",
      "type": "exclusiveGateway",
      "x": 2033,
      "y": 695,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0qczdqx",
      "type": "manualTask",
      "x": 2008,
      "y": 520,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_1bn5itv",
      "type": "exclusiveGateway",
      "x": 2273,
      "y": 695,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1v9nhn6",
      "type": "manualTask",
      "x": 2308,
      "y": 270,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0qgjm9t",
      "type": "manualTask",
      "x": 2488,
      "y": 270,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1bsikhg",
      "type": "manualTask",
      "x": 2683,
      "y": 530,
      "width": 130,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_07245n1",
      "type": "parallelGateway",
      "x": 2723,
      "y": 285,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_1vloo7b",
      "type": "endEvent",
      "x": 2749,
      "y": 716,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1xpz17m",
      "type": "manualTask",
      "x": 2858,
      "y": 270,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0iru4xz",
      "type": "exclusiveGateway",
      "x": 2883,
      "y": 545,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_093jrpv",
      "type": "exclusiveGateway",
      "x": 6895,
      "y": 635,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1ejspav",
      "type": "manualTask",
      "x": 7060,
      "y": 620,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_09vjop1",
      "type": "userTask",
      "x": 7270,
      "y": 620,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1tfcgsk",
      "type": "userTask",
      "x": 7255,
      "y": 950,
      "width": 130,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_1d6uysn",
      "type": "serviceTask",
      "x": 7430,
      "y": -50,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_1eqn8ef",
      "type": "manualTask",
      "x": 7610,
      "y": 410,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_05lk1ui",
      "type": "manualTask",
      "x": 7990,
      "y": 410,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_16bkf36",
      "type": "manualTask",
      "x": 7990,
      "y": 570,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_03llekp",
      "type": "manualTask",
      "x": 8165,
      "y": 20,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_06ium73",
      "type": "manualTask",
      "x": 8350,
      "y": 350,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0jjmsoc",
      "type": "manualTask",
      "x": 8560,
      "y": 20,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    },
    {
      "id": "Activity_1m84zbc",
      "type": "manualTask",
      "x": 8790,
      "y": 890,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0mmhlfw",
      "laneBounds": {
        "x": 295,
        "y": 850,
        "width": 9383,
        "height": 887
      }
    },
    {
      "id": "Activity_0t60tni",
      "type": "manualTask",
      "x": 9000,
      "y": 520,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1wkkahd",
      "type": "subProcess",
      "x": 9210,
      "y": 520,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Event_1g5pk5b",
      "type": "startEvent",
      "x": 732,
      "y": 638,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1a6ynx6",
      "type": "manualTask",
      "x": 869,
      "y": 611,
      "width": 110,
      "height": 90,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0ezguo2",
      "type": "manualTask",
      "x": 1049,
      "y": 621,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0kdfhoe",
      "type": "manualTask",
      "x": 1239,
      "y": 621,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0mr7v9y",
      "type": "manualTask",
      "x": 1418,
      "y": 770,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0uue82x",
      "type": "exclusiveGateway",
      "x": 1443,
      "y": 651,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0jvwctq",
      "type": "manualTask",
      "x": 1589,
      "y": 621,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_1wcu83c",
      "type": "manualTask",
      "x": 1819,
      "y": 491,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0j8zu62",
      "type": "exclusiveGateway",
      "x": 1844,
      "y": 651,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0dj9gz1",
      "type": "exclusiveGateway",
      "x": 2084,
      "y": 651,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_09nohhc",
      "type": "manualTask",
      "x": 2343,
      "y": 256,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0v0o9vi",
      "type": "manualTask",
      "x": 2523,
      "y": 256,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_1j333xd",
      "type": "endEvent",
      "x": 2560,
      "y": 711,
      "width": 36,
      "height": 36,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_164j62e",
      "type": "manualTask",
      "x": 2678,
      "y": 491,
      "width": 130,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_0kk3mw8",
      "type": "parallelGateway",
      "x": 2758,
      "y": 286,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Activity_0vaye1j",
      "type": "manualTask",
      "x": 2868,
      "y": 271,
      "width": 100,
      "height": 80,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Gateway_01e6c3d",
      "type": "exclusiveGateway",
      "x": 2893,
      "y": 521,
      "width": 50,
      "height": 50,
      "laneKey": "Participant_0tnyx1n",
      "laneBounds": {
        "x": 265,
        "y": -130,
        "width": 9413,
        "height": 1867
      }
    },
    {
      "id": "Event_1a1gr89",
      "type": "boundaryEvent",
      "x": 7462,
      "y": 12,
      "width": 36,
      "height": 36,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      },
      "attachedTo": "Activity_1d6uysn"
    },
    {
      "id": "Gateway_0u7zcip",
      "type": "exclusiveGateway",
      "x": 7850,
      "y": 425,
      "width": 50,
      "height": 50,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_0bkh7kx",
      "type": "receiveTask",
      "x": 8140,
      "y": 570,
      "width": 150,
      "height": 80,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Event_1n46r9w",
      "type": "endEvent",
      "x": 9454,
      "y": 542,
      "width": 36,
      "height": 36,
      "laneKey": "Lane_1yey8lq",
      "laneBounds": {
        "x": 295,
        "y": 270,
        "width": 9383,
        "height": 580
      }
    },
    {
      "id": "Activity_1wl35ag",
      "type": "userTask",
      "x": 820,
      "y": 70,
      "width": 100,
      "height": 80,
      "laneKey": "Lane_0td3ono",
      "laneBounds": {
        "x": 295,
        "y": -130,
        "width": 9383,
        "height": 400
      }
    }
  ];

export const connections = [
    {
      "id": "Flow_0z8fgln",
      "kind": "sequenceFlow",
      "sourceId": "Event_18w7id0",
      "targetId": "Event_0kkmo7n",
      "waypoints": [
        {
          "x": 490,
          "y": 378
        },
        {
          "x": 490,
          "y": 482
        }
      ]
    },
    {
      "id": "Flow_0vvymt6",
      "kind": "sequenceFlow",
      "sourceId": "Event_0kkmo7n",
      "targetId": "Activity_0ecrgua",
      "waypoints": [
        {
          "x": 490,
          "y": 518
        },
        {
          "x": 490,
          "y": 630
        }
      ]
    },
    {
      "id": "Flow_12m3afb",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0ecrgua",
      "targetId": "Activity_0cyj686",
      "waypoints": [
        {
          "x": 490,
          "y": 710
        },
        {
          "x": 490,
          "y": 1100
        }
      ]
    },
    {
      "id": "Flow_0u6qnxj",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0cyj686",
      "targetId": "Activity_1jaf7uo",
      "waypoints": [
        {
          "x": 540,
          "y": 1140
        },
        {
          "x": 590,
          "y": 1140
        }
      ]
    },
    {
      "id": "Flow_0xf353n",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1jaf7uo",
      "targetId": "Gateway_1cf96y5",
      "waypoints": [
        {
          "x": 640,
          "y": 1100
        },
        {
          "x": 640,
          "y": 1035
        }
      ]
    },
    {
      "id": "Flow_06awjgt",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1cf96y5",
      "targetId": "Gateway_1fbll4e",
      "waypoints": [
        {
          "x": 665,
          "y": 1010
        },
        {
          "x": 715,
          "y": 1010
        }
      ]
    },
    {
      "id": "Flow_13agrvj",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1fbll4e",
      "targetId": "Activity_0kk3jez",
      "waypoints": [
        {
          "x": 765,
          "y": 1010
        },
        {
          "x": 820,
          "y": 1010
        }
      ]
    },
    {
      "id": "Flow_0icxkyd",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0kk3jez",
      "targetId": "Gateway_0zg6re9",
      "waypoints": [
        {
          "x": 870,
          "y": 970
        },
        {
          "x": 870,
          "y": 915
        }
      ]
    },
    {
      "id": "Flow_1i81x4c",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0zg6re9",
      "targetId": "Activity_165w0qp",
      "waypoints": [
        {
          "x": 895,
          "y": 890
        },
        {
          "x": 933,
          "y": 890
        },
        {
          "x": 933,
          "y": 900
        },
        {
          "x": 970,
          "y": 900
        }
      ]
    },
    {
      "id": "Flow_1lqmkbt",
      "kind": "sequenceFlow",
      "sourceId": "Activity_165w0qp",
      "targetId": "Gateway_0zzg2xj",
      "waypoints": [
        {
          "x": 1070,
          "y": 900
        },
        {
          "x": 1145,
          "y": 900
        }
      ]
    },
    {
      "id": "Flow_0o7mtdo",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0zzg2xj",
      "targetId": "Event_0yo3h7z",
      "waypoints": [
        {
          "x": 1195,
          "y": 900
        },
        {
          "x": 1272,
          "y": 900
        }
      ]
    },
    {
      "id": "Flow_1hafwue",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0zzg2xj",
      "targetId": "Gateway_1fbll4e",
      "waypoints": [
        {
          "x": 1170,
          "y": 925
        },
        {
          "x": 1170,
          "y": 1090
        },
        {
          "x": 740,
          "y": 1090
        },
        {
          "x": 740,
          "y": 1035
        }
      ]
    },
    {
      "id": "Flow_1nrol50",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0zg6re9",
      "targetId": "Activity_1wl35ag",
      "waypoints": [
        {
          "x": 870,
          "y": 865
        },
        {
          "x": 870,
          "y": 150
        }
      ]
    },
    {
      "id": "Flow_0iu8ksj",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1wl35ag",
      "targetId": "Activity_11ez4hx",
      "waypoints": [
        {
          "x": 920,
          "y": 110
        },
        {
          "x": 970,
          "y": 110
        },
        {
          "x": 970,
          "y": 500
        },
        {
          "x": 1020,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1k8uydh",
      "kind": "sequenceFlow",
      "sourceId": "Activity_11ez4hx",
      "targetId": "Gateway_1bemc3f",
      "waypoints": [
        {
          "x": 1120,
          "y": 500
        },
        {
          "x": 1225,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0f3gbab",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1bemc3f",
      "targetId": "Activity_1k4j03v",
      "waypoints": [
        {
          "x": 1275,
          "y": 500
        },
        {
          "x": 1380,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0jukydn",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1bemc3f",
      "targetId": "Gateway_1yiacd4",
      "waypoints": [
        {
          "x": 1250,
          "y": 525
        },
        {
          "x": 1250,
          "y": 610
        },
        {
          "x": 1405,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0pu8nr9",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1k4j03v",
      "targetId": "Gateway_1yiacd4",
      "waypoints": [
        {
          "x": 1430,
          "y": 540
        },
        {
          "x": 1430,
          "y": 585
        }
      ]
    },
    {
      "id": "Flow_1112crj",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1yiacd4",
      "targetId": "Activity_06lwhx0",
      "waypoints": [
        {
          "x": 1455,
          "y": 610
        },
        {
          "x": 1670,
          "y": 610
        },
        {
          "x": 1670,
          "y": 90
        }
      ]
    },
    {
      "id": "Flow_007q3oq",
      "kind": "sequenceFlow",
      "sourceId": "Activity_06lwhx0",
      "targetId": "Activity_1qgja13",
      "waypoints": [
        {
          "x": 1720,
          "y": 50
        },
        {
          "x": 1795,
          "y": 50
        },
        {
          "x": 1795,
          "y": 500
        },
        {
          "x": 1870,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_04n6fki",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1qgja13",
      "targetId": "Activity_1y86glf",
      "waypoints": [
        {
          "x": 1920,
          "y": 460
        },
        {
          "x": 1920,
          "y": 90
        }
      ]
    },
    {
      "id": "Flow_0hzfdoo",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1y86glf",
      "targetId": "Activity_0p4llny",
      "waypoints": [
        {
          "x": 1970,
          "y": 50
        },
        {
          "x": 2020,
          "y": 50
        }
      ]
    },
    {
      "id": "Flow_0io99ou",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0p4llny",
      "targetId": "Activity_1lphyop",
      "waypoints": [
        {
          "x": 2070,
          "y": 90
        },
        {
          "x": 2070,
          "y": 900
        }
      ]
    },
    {
      "id": "Flow_16xjjb0",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1lphyop",
      "targetId": "Activity_0etkgte",
      "waypoints": [
        {
          "x": 2120,
          "y": 940
        },
        {
          "x": 2230,
          "y": 940
        },
        {
          "x": 2230,
          "y": 540
        }
      ]
    },
    {
      "id": "Flow_07uv4fr",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0etkgte",
      "targetId": "Activity_1cxm6js",
      "waypoints": [
        {
          "x": 2310,
          "y": 500
        },
        {
          "x": 2370,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1v1ejjy",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1cxm6js",
      "targetId": "Activity_1rmpcfi",
      "waypoints": [
        {
          "x": 2470,
          "y": 500
        },
        {
          "x": 2530,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1btes60",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1rmpcfi",
      "targetId": "Activity_00gzfh2",
      "waypoints": [
        {
          "x": 2580,
          "y": 460
        },
        {
          "x": 2580,
          "y": 90
        }
      ]
    },
    {
      "id": "Flow_0it5a14",
      "kind": "sequenceFlow",
      "sourceId": "Activity_00gzfh2",
      "targetId": "Activity_018evbx",
      "waypoints": [
        {
          "x": 2630,
          "y": 50
        },
        {
          "x": 2770,
          "y": 50
        },
        {
          "x": 2770,
          "y": 460
        }
      ]
    },
    {
      "id": "Flow_0kewawc",
      "kind": "sequenceFlow",
      "sourceId": "Activity_018evbx",
      "targetId": "Activity_01fh7t2",
      "waypoints": [
        {
          "x": 2820,
          "y": 500
        },
        {
          "x": 2940,
          "y": 500
        },
        {
          "x": 2940,
          "y": 90
        }
      ]
    },
    {
      "id": "Flow_08iiiyh",
      "kind": "sequenceFlow",
      "sourceId": "Activity_01fh7t2",
      "targetId": "Activity_0rsnima",
      "waypoints": [
        {
          "x": 2990,
          "y": 50
        },
        {
          "x": 3110,
          "y": 50
        },
        {
          "x": 3110,
          "y": 460
        }
      ]
    },
    {
      "id": "Flow_1ol7cup",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0rsnima",
      "targetId": "Activity_0xta76p",
      "waypoints": [
        {
          "x": 3160,
          "y": 500
        },
        {
          "x": 3230,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0ydf38x",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0xta76p",
      "targetId": "Activity_1ijfo0l",
      "waypoints": [
        {
          "x": 3390,
          "y": 500
        },
        {
          "x": 3460,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1qq15ey",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1ijfo0l",
      "targetId": "Activity_1w66mlr",
      "waypoints": [
        {
          "x": 3590,
          "y": 500
        },
        {
          "x": 3660,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0t3f09o",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1w66mlr",
      "targetId": "Activity_18u0097",
      "waypoints": [
        {
          "x": 3760,
          "y": 500
        },
        {
          "x": 3830,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1o6tqe1",
      "kind": "sequenceFlow",
      "sourceId": "Activity_18u0097",
      "targetId": "Gateway_1kl72h3",
      "waypoints": [
        {
          "x": 3930,
          "y": 500
        },
        {
          "x": 4005,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0dhpsde",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1kl72h3",
      "targetId": "Gateway_0ogzfhv",
      "waypoints": [
        {
          "x": 4055,
          "y": 500
        },
        {
          "x": 4135,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1tgsnc4",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1kl72h3",
      "targetId": "Activity_0z2tc4a",
      "waypoints": [
        {
          "x": 4030,
          "y": 525
        },
        {
          "x": 4030,
          "y": 610
        },
        {
          "x": 4110,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0h18r1m",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0z2tc4a",
      "targetId": "Gateway_0ogzfhv",
      "waypoints": [
        {
          "x": 4160,
          "y": 570
        },
        {
          "x": 4160,
          "y": 525
        }
      ]
    },
    {
      "id": "Flow_0uhkch8",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0ogzfhv",
      "targetId": "Activity_0jctmxx",
      "waypoints": [
        {
          "x": 4185,
          "y": 500
        },
        {
          "x": 4270,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0gwylp0",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0jctmxx",
      "targetId": "Activity_0d3l8t3",
      "waypoints": [
        {
          "x": 4400,
          "y": 500
        },
        {
          "x": 4490,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_16nmu43",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0d3l8t3",
      "targetId": "Gateway_16aa5c2",
      "waypoints": [
        {
          "x": 4590,
          "y": 500
        },
        {
          "x": 4685,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0yocx37",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_16aa5c2",
      "targetId": "Activity_0uhasv4",
      "waypoints": [
        {
          "x": 4735,
          "y": 500
        },
        {
          "x": 4830,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_04ndor1",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0uhasv4",
      "targetId": "Activity_0hrn483",
      "waypoints": [
        {
          "x": 4940,
          "y": 500
        },
        {
          "x": 5040,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_15kohmf",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0hrn483",
      "targetId": "Activity_154k7eo",
      "waypoints": [
        {
          "x": 5140,
          "y": 500
        },
        {
          "x": 5240,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_1t1u7py",
      "kind": "sequenceFlow",
      "sourceId": "Activity_154k7eo",
      "targetId": "Activity_1hpntdk",
      "waypoints": [
        {
          "x": 5340,
          "y": 500
        },
        {
          "x": 5440,
          "y": 500
        }
      ]
    },
    {
      "id": "Flow_0h0hq0z",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_16aa5c2",
      "targetId": "Activity_0zmctxe",
      "waypoints": [
        {
          "x": 4710,
          "y": 525
        },
        {
          "x": 4710,
          "y": 610
        },
        {
          "x": 4830,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_1rhop2c",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0zmctxe",
      "targetId": "Gateway_1qzft9o",
      "waypoints": [
        {
          "x": 4930,
          "y": 610
        },
        {
          "x": 5025,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_1ngq0rj",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1qzft9o",
      "targetId": "Activity_1rudwfz",
      "waypoints": [
        {
          "x": 5075,
          "y": 610
        },
        {
          "x": 5170,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0txhd1h",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1rudwfz",
      "targetId": "Activity_0evlt3s",
      "waypoints": [
        {
          "x": 5270,
          "y": 610
        },
        {
          "x": 5370,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0ltpaci",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0evlt3s",
      "targetId": "Activity_0ajzxf1",
      "waypoints": [
        {
          "x": 5490,
          "y": 610
        },
        {
          "x": 5590,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_1pz1ffm",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0ajzxf1",
      "targetId": "Gateway_08d2l5f",
      "waypoints": [
        {
          "x": 5690,
          "y": 610
        },
        {
          "x": 5795,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_08trot5",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1qzft9o",
      "targetId": "Gateway_08d2l5f",
      "waypoints": [
        {
          "x": 5050,
          "y": 635
        },
        {
          "x": 5050,
          "y": 710
        },
        {
          "x": 5820,
          "y": 710
        },
        {
          "x": 5820,
          "y": 635
        }
      ]
    },
    {
      "id": "Flow_0l3fy9e",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1hpntdk",
      "targetId": "Gateway_08d2l5f",
      "waypoints": [
        {
          "x": 5540,
          "y": 500
        },
        {
          "x": 5820,
          "y": 500
        },
        {
          "x": 5820,
          "y": 585
        }
      ]
    },
    {
      "id": "Flow_13liyyg",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_08d2l5f",
      "targetId": "Activity_1wjzi4h",
      "waypoints": [
        {
          "x": 5845,
          "y": 610
        },
        {
          "x": 5950,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_17v346j",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1wjzi4h",
      "targetId": "Activity_140ck0p",
      "waypoints": [
        {
          "x": 6050,
          "y": 610
        },
        {
          "x": 6160,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_13pxd2u",
      "kind": "sequenceFlow",
      "sourceId": "Activity_140ck0p",
      "targetId": "Activity_0tw6my2",
      "waypoints": [
        {
          "x": 6260,
          "y": 610
        },
        {
          "x": 6370,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0rioqu6",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0tw6my2",
      "targetId": "Activity_1jr18bj",
      "waypoints": [
        {
          "x": 6470,
          "y": 610
        },
        {
          "x": 6580,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_19z8nvn",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1jr18bj",
      "targetId": "Gateway_12jc8w3",
      "waypoints": [
        {
          "x": 6630,
          "y": 570
        },
        {
          "x": 6630,
          "y": 455
        }
      ]
    },
    {
      "id": "Flow_0xxdor6",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_12jc8w3",
      "targetId": "Activity_0v58hzd",
      "waypoints": [
        {
          "x": 6655,
          "y": 430
        },
        {
          "x": 6710,
          "y": 430
        }
      ]
    },
    {
      "id": "Flow_0v7ymsf",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0ulf2sc",
      "targetId": "Gateway_0tf63z8",
      "waypoints": [
        {
          "x": 1151,
          "y": 764
        },
        {
          "x": 1200,
          "y": 764
        },
        {
          "x": 1200,
          "y": 779
        },
        {
          "x": 1246,
          "y": 779
        }
      ]
    },
    {
      "id": "Flow_1pk459s",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1oxngr8",
      "targetId": "Gateway_0tf63z8",
      "waypoints": [
        {
          "x": 1271,
          "y": 880
        },
        {
          "x": 1271,
          "y": 804
        }
      ]
    },
    {
      "id": "Flow_0bg52mg",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0c5q1qb",
      "targetId": "Gateway_1cb54g5",
      "waypoints": [
        {
          "x": 951,
          "y": 1024
        },
        {
          "x": 1000,
          "y": 1024
        },
        {
          "x": 1000,
          "y": 1039
        },
        {
          "x": 1046,
          "y": 1039
        }
      ]
    },
    {
      "id": "Flow_1xcmuuv",
      "kind": "sequenceFlow",
      "sourceId": "Event_17cdftw",
      "targetId": "Gateway_10zr6lk",
      "waypoints": [
        {
          "x": 583,
          "y": 634
        },
        {
          "x": 626,
          "y": 634
        }
      ]
    },
    {
      "id": "Flow_1inuulw",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1d8sifu",
      "targetId": "Event_0l6zobm",
      "waypoints": [
        {
          "x": 1746,
          "y": 641
        },
        {
          "x": 1830,
          "y": 641
        },
        {
          "x": 1830,
          "y": 648
        },
        {
          "x": 1917,
          "y": 648
        }
      ]
    },
    {
      "id": "Flow_0uwd4pq",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1d6o982",
      "targetId": "Gateway_0xqiuxz",
      "waypoints": [
        {
          "x": 1220,
          "y": 340
        },
        {
          "x": 1281,
          "y": 340
        },
        {
          "x": 1281,
          "y": 263
        }
      ]
    },
    {
      "id": "Flow_02vto3x",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_02r5f5n",
      "targetId": "Gateway_1u2m1kf",
      "waypoints": [
        {
          "x": 1411,
          "y": 754
        },
        {
          "x": 1411,
          "y": 666
        }
      ]
    },
    {
      "id": "Flow_1fptylz",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_14g6xhm",
      "targetId": "Gateway_1u2m1kf",
      "waypoints": [
        {
          "x": 1411,
          "y": 429
        },
        {
          "x": 1411,
          "y": 616
        }
      ]
    },
    {
      "id": "Flow_1ebij9b",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_10zr6lk",
      "targetId": "Gateway_020hgsi",
      "waypoints": [
        {
          "x": 651,
          "y": 609
        },
        {
          "x": 651,
          "y": 404
        },
        {
          "x": 776,
          "y": 404
        }
      ]
    },
    {
      "id": "Flow_01wqsgw",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0xqiuxz",
      "targetId": "Gateway_14g6xhm",
      "waypoints": [
        {
          "x": 1306,
          "y": 238
        },
        {
          "x": 1411,
          "y": 238
        },
        {
          "x": 1411,
          "y": 379
        }
      ]
    },
    {
      "id": "Flow_0oazl2x",
      "kind": "sequenceFlow",
      "sourceId": "Activity_18prpj1",
      "targetId": "Activity_0ulf2sc",
      "waypoints": [
        {
          "x": 951,
          "y": 764
        },
        {
          "x": 1051,
          "y": 764
        }
      ]
    },
    {
      "id": "Flow_0nlltaw",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_020hgsi",
      "targetId": "Activity_1m0459y",
      "waypoints": [
        {
          "x": 801,
          "y": 379
        },
        {
          "x": 801,
          "y": 223
        },
        {
          "x": 851,
          "y": 223
        }
      ]
    },
    {
      "id": "Flow_0yjtrmw",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_10zr6lk",
      "targetId": "Gateway_08nkv04",
      "waypoints": [
        {
          "x": 651,
          "y": 659
        },
        {
          "x": 651,
          "y": 934
        },
        {
          "x": 766,
          "y": 934
        }
      ]
    },
    {
      "id": "Flow_1xwnt1i",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1cb54g5",
      "targetId": "Gateway_02r5f5n",
      "waypoints": [
        {
          "x": 1096,
          "y": 1039
        },
        {
          "x": 1411,
          "y": 1039
        },
        {
          "x": 1411,
          "y": 804
        }
      ]
    },
    {
      "id": "Flow_08zj4w1",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_08nkv04",
      "targetId": "Activity_0c5q1qb",
      "waypoints": [
        {
          "x": 791,
          "y": 959
        },
        {
          "x": 791,
          "y": 1024
        },
        {
          "x": 851,
          "y": 1024
        }
      ]
    },
    {
      "id": "Flow_0rlg5hh",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_08nkv04",
      "targetId": "Activity_18prpj1",
      "waypoints": [
        {
          "x": 791,
          "y": 909
        },
        {
          "x": 791,
          "y": 764
        },
        {
          "x": 851,
          "y": 764
        }
      ]
    },
    {
      "id": "Flow_055iu2p",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0tf63z8",
      "targetId": "Gateway_02r5f5n",
      "waypoints": [
        {
          "x": 1296,
          "y": 779
        },
        {
          "x": 1386,
          "y": 779
        }
      ]
    },
    {
      "id": "Flow_1omdf2u",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1m0459y",
      "targetId": "Activity_0ij5omz",
      "waypoints": [
        {
          "x": 951,
          "y": 223
        },
        {
          "x": 1051,
          "y": 223
        }
      ]
    },
    {
      "id": "Flow_0r2vpje",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1u2m1kf",
      "targetId": "Activity_1d8sifu",
      "waypoints": [
        {
          "x": 1436,
          "y": 641
        },
        {
          "x": 1646,
          "y": 641
        }
      ]
    },
    {
      "id": "Flow_0wj8s6c",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0ivdvdg",
      "targetId": "Gateway_14g6xhm",
      "waypoints": [
        {
          "x": 1091,
          "y": 513
        },
        {
          "x": 1091,
          "y": 404
        },
        {
          "x": 1386,
          "y": 404
        }
      ]
    },
    {
      "id": "Flow_0je384w",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0ij5omz",
      "targetId": "Gateway_0xqiuxz",
      "waypoints": [
        {
          "x": 1151,
          "y": 223
        },
        {
          "x": 1200,
          "y": 223
        },
        {
          "x": 1200,
          "y": 238
        },
        {
          "x": 1256,
          "y": 238
        }
      ]
    },
    {
      "id": "Flow_0r6lubq",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_020hgsi",
      "targetId": "Activity_1faaosa",
      "waypoints": [
        {
          "x": 801,
          "y": 429
        },
        {
          "x": 801,
          "y": 523
        },
        {
          "x": 876,
          "y": 523
        }
      ]
    },
    {
      "id": "Flow_068ofcw",
      "kind": "sequenceFlow",
      "sourceId": "Activity_12c94ge",
      "targetId": "Gateway_0ivdvdg",
      "waypoints": [
        {
          "x": 1091,
          "y": 601
        },
        {
          "x": 1091,
          "y": 563
        }
      ]
    },
    {
      "id": "Flow_1oq7got",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1faaosa",
      "targetId": "Gateway_0ivdvdg",
      "waypoints": [
        {
          "x": 976,
          "y": 523
        },
        {
          "x": 1020,
          "y": 523
        },
        {
          "x": 1020,
          "y": 538
        },
        {
          "x": 1066,
          "y": 538
        }
      ]
    },
    {
      "id": "Flow_1du42zl",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0pufjk5",
      "targetId": "Gateway_1cb54g5",
      "waypoints": [
        {
          "x": 1071,
          "y": 1140
        },
        {
          "x": 1071,
          "y": 1064
        }
      ]
    },
    {
      "id": "Flow_0x068qr",
      "kind": "sequenceFlow",
      "sourceId": "Event_1uxj946",
      "targetId": "Activity_1d6o982",
      "waypoints": [
        {
          "x": 1100,
          "y": 281
        },
        {
          "x": 1100,
          "y": 340
        },
        {
          "x": 1120,
          "y": 340
        }
      ]
    },
    {
      "id": "Flow_03t5l9s",
      "kind": "sequenceFlow",
      "sourceId": "Event_0q1ogtz",
      "targetId": "Activity_12c94ge",
      "waypoints": [
        {
          "x": 930,
          "y": 581
        },
        {
          "x": 930,
          "y": 641
        },
        {
          "x": 1041,
          "y": 641
        }
      ]
    },
    {
      "id": "Flow_0f11vra",
      "kind": "sequenceFlow",
      "sourceId": "Event_0hakvgr",
      "targetId": "Activity_1oxngr8",
      "waypoints": [
        {
          "x": 1100,
          "y": 822
        },
        {
          "x": 1100,
          "y": 920
        },
        {
          "x": 1221,
          "y": 920
        }
      ]
    },
    {
      "id": "Flow_07kbbpn",
      "kind": "sequenceFlow",
      "sourceId": "Event_1ruj7lr",
      "targetId": "Activity_0pufjk5",
      "waypoints": [
        {
          "x": 910,
          "y": 1082
        },
        {
          "x": 910,
          "y": 1180
        },
        {
          "x": 1021,
          "y": 1180
        }
      ]
    },
    {
      "id": "Flow_0dk99f6",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_12jc8w3",
      "targetId": "Gateway_0o671nj",
      "waypoints": [
        {
          "x": 6635,
          "y": 450
        },
        {
          "x": 6660,
          "y": 550
        },
        {
          "x": 6735,
          "y": 550
        }
      ]
    },
    {
      "id": "Flow_0n6eldt",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0v58hzd",
      "targetId": "Gateway_0o671nj",
      "waypoints": [
        {
          "x": 6760,
          "y": 470
        },
        {
          "x": 6760,
          "y": 525
        }
      ]
    },
    {
      "id": "Flow_0pvhyho",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0o671nj",
      "targetId": "Activity_1ioomae",
      "waypoints": [
        {
          "x": 6785,
          "y": 550
        },
        {
          "x": 6870,
          "y": 550
        }
      ]
    },
    {
      "id": "Flow_1rkt9ed",
      "kind": "sequenceFlow",
      "sourceId": "Activity_08zpg63",
      "targetId": "Activity_097ouyq",
      "waypoints": [
        {
          "x": 1168,
          "y": 685
        },
        {
          "x": 1200,
          "y": 685
        },
        {
          "x": 1200,
          "y": 690
        },
        {
          "x": 1238,
          "y": 690
        }
      ]
    },
    {
      "id": "Flow_0itol50",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1lkjitz",
      "targetId": "Event_0jb6acb",
      "waypoints": [
        {
          "x": 800,
          "y": 366
        },
        {
          "x": 920,
          "y": 366
        },
        {
          "x": 920,
          "y": 734
        },
        {
          "x": 1034,
          "y": 734
        }
      ]
    },
    {
      "id": "Flow_1c4vgak",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1ggot16",
      "targetId": "Activity_0iii88j",
      "waypoints": [
        {
          "x": 1698,
          "y": 745
        },
        {
          "x": 1698,
          "y": 790
        }
      ]
    },
    {
      "id": "Flow_0j6f59w",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1v9nhn6",
      "targetId": "Activity_0qgjm9t",
      "waypoints": [
        {
          "x": 2408,
          "y": 310
        },
        {
          "x": 2488,
          "y": 310
        }
      ]
    },
    {
      "id": "Flow_06z3hw3",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1bn5itv",
      "targetId": "Event_1vloo7b",
      "waypoints": [
        {
          "x": 2323,
          "y": 720
        },
        {
          "x": 2540,
          "y": 720
        },
        {
          "x": 2540,
          "y": 734
        },
        {
          "x": 2749,
          "y": 734
        }
      ]
    },
    {
      "id": "Flow_1503d56",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1xpz17m",
      "targetId": "Gateway_0iru4xz",
      "waypoints": [
        {
          "x": 2908,
          "y": 350
        },
        {
          "x": 2908,
          "y": 545
        }
      ]
    },
    {
      "id": "Flow_1wom781",
      "kind": "sequenceFlow",
      "sourceId": "Activity_00p2rjg",
      "targetId": "Gateway_00sv5kg",
      "waypoints": [
        {
          "x": 1878,
          "y": 690
        },
        {
          "x": 1960,
          "y": 690
        },
        {
          "x": 1960,
          "y": 720
        },
        {
          "x": 2033,
          "y": 720
        }
      ]
    },
    {
      "id": "Flow_115log4",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0qgjm9t",
      "targetId": "Gateway_07245n1",
      "waypoints": [
        {
          "x": 2588,
          "y": 310
        },
        {
          "x": 2723,
          "y": 310
        }
      ]
    },
    {
      "id": "Flow_04s9py7",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1ggot16",
      "targetId": "Activity_00p2rjg",
      "waypoints": [
        {
          "x": 1723,
          "y": 720
        },
        {
          "x": 1750,
          "y": 720
        },
        {
          "x": 1750,
          "y": 690
        },
        {
          "x": 1778,
          "y": 690
        }
      ]
    },
    {
      "id": "Flow_0z4rens",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_1bn5itv",
      "targetId": "Activity_1v9nhn6",
      "waypoints": [
        {
          "x": 2298,
          "y": 695
        },
        {
          "x": 2298,
          "y": 520
        },
        {
          "x": 2358,
          "y": 520
        },
        {
          "x": 2358,
          "y": 350
        }
      ]
    },
    {
      "id": "Flow_05n2x1c",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0qczdqx",
      "targetId": "Gateway_1bn5itv",
      "waypoints": [
        {
          "x": 2108,
          "y": 560
        },
        {
          "x": 2298,
          "y": 560
        },
        {
          "x": 2298,
          "y": 695
        }
      ]
    },
    {
      "id": "Flow_0ebthlr",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_07245n1",
      "targetId": "Activity_1bsikhg",
      "waypoints": [
        {
          "x": 2748,
          "y": 335
        },
        {
          "x": 2748,
          "y": 530
        }
      ]
    },
    {
      "id": "Flow_1j78mcx",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0otpcam",
      "targetId": "Gateway_1ggot16",
      "waypoints": [
        {
          "x": 1528,
          "y": 690
        },
        {
          "x": 1600,
          "y": 690
        },
        {
          "x": 1600,
          "y": 720
        },
        {
          "x": 1673,
          "y": 720
        }
      ]
    },
    {
      "id": "Flow_086n1un",
      "kind": "sequenceFlow",
      "sourceId": "Activity_097ouyq",
      "targetId": "Activity_0otpcam",
      "waypoints": [
        {
          "x": 1338,
          "y": 690
        },
        {
          "x": 1428,
          "y": 690
        }
      ]
    },
    {
      "id": "Flow_19agx97",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_00sv5kg",
      "targetId": "Gateway_1bn5itv",
      "waypoints": [
        {
          "x": 2083,
          "y": 720
        },
        {
          "x": 2273,
          "y": 720
        }
      ]
    },
    {
      "id": "Flow_1p8pu5u",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0iru4xz",
      "targetId": "Event_1vloo7b",
      "waypoints": [
        {
          "x": 2908,
          "y": 595
        },
        {
          "x": 2908,
          "y": 734
        },
        {
          "x": 2785,
          "y": 734
        }
      ]
    },
    {
      "id": "Flow_0g3fl3e",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0iii88j",
      "targetId": "Activity_00p2rjg",
      "waypoints": [
        {
          "x": 1748,
          "y": 830
        },
        {
          "x": 1828,
          "y": 830
        },
        {
          "x": 1828,
          "y": 730
        }
      ]
    },
    {
      "id": "Flow_0ystb9z",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_07245n1",
      "targetId": "Activity_1xpz17m",
      "waypoints": [
        {
          "x": 2773,
          "y": 310
        },
        {
          "x": 2858,
          "y": 310
        }
      ]
    },
    {
      "id": "Flow_08z05be",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1bsikhg",
      "targetId": "Gateway_0iru4xz",
      "waypoints": [
        {
          "x": 2813,
          "y": 570
        },
        {
          "x": 2883,
          "y": 570
        }
      ]
    },
    {
      "id": "Flow_1w3gzo0",
      "kind": "sequenceFlow",
      "sourceId": "Event_0jb6acb",
      "targetId": "Activity_08zpg63",
      "waypoints": [
        {
          "x": 1052,
          "y": 716
        },
        {
          "x": 1052,
          "y": 620
        },
        {
          "x": 1113,
          "y": 620
        },
        {
          "x": 1113,
          "y": 640
        }
      ]
    },
    {
      "id": "Flow_0qzgywv",
      "kind": "sequenceFlow",
      "sourceId": "Event_0o5hi0x",
      "targetId": "Activity_0a7fen4",
      "waypoints": [
        {
          "x": 448,
          "y": 366
        },
        {
          "x": 540,
          "y": 366
        }
      ]
    },
    {
      "id": "Flow_024hijh",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0a7fen4",
      "targetId": "Activity_1lkjitz",
      "waypoints": [
        {
          "x": 640,
          "y": 366
        },
        {
          "x": 700,
          "y": 366
        }
      ]
    },
    {
      "id": "Flow_0osl39p",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_00sv5kg",
      "targetId": "Activity_0qczdqx",
      "waypoints": [
        {
          "x": 2058,
          "y": 695
        },
        {
          "x": 2058,
          "y": 600
        }
      ]
    },
    {
      "id": "Flow_19d71cy",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0o671nj",
      "targetId": "Gateway_093jrpv",
      "waypoints": [
        {
          "x": 6760,
          "y": 575
        },
        {
          "x": 6760,
          "y": 660
        },
        {
          "x": 6895,
          "y": 660
        }
      ]
    },
    {
      "id": "Flow_0zd3plm",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1ioomae",
      "targetId": "Gateway_093jrpv",
      "waypoints": [
        {
          "x": 6920,
          "y": 590
        },
        {
          "x": 6920,
          "y": 635
        }
      ]
    },
    {
      "id": "Flow_0wvy7g1",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_093jrpv",
      "targetId": "Activity_1ejspav",
      "waypoints": [
        {
          "x": 6945,
          "y": 660
        },
        {
          "x": 7060,
          "y": 660
        }
      ]
    },
    {
      "id": "Flow_0xyi5og",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_01e6c3d",
      "targetId": "Event_1j333xd",
      "waypoints": [
        {
          "x": 2918,
          "y": 571
        },
        {
          "x": 2918,
          "y": 729
        },
        {
          "x": 2596,
          "y": 729
        }
      ]
    },
    {
      "id": "Flow_0ndz4ab",
      "kind": "sequenceFlow",
      "sourceId": "Event_1g5pk5b",
      "targetId": "Activity_1a6ynx6",
      "waypoints": [
        {
          "x": 768,
          "y": 656
        },
        {
          "x": 869,
          "y": 656
        }
      ]
    },
    {
      "id": "Flow_1q0sykg",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0kk3mw8",
      "targetId": "Activity_0vaye1j",
      "waypoints": [
        {
          "x": 2808,
          "y": 311
        },
        {
          "x": 2868,
          "y": 311
        }
      ]
    },
    {
      "id": "Flow_1sh7jxc",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0mr7v9y",
      "targetId": "Activity_0jvwctq",
      "waypoints": [
        {
          "x": 1518,
          "y": 810
        },
        {
          "x": 1620,
          "y": 810
        },
        {
          "x": 1620,
          "y": 701
        }
      ]
    },
    {
      "id": "Flow_12mrh4m",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1a6ynx6",
      "targetId": "Activity_0ezguo2",
      "waypoints": [
        {
          "x": 979,
          "y": 656
        },
        {
          "x": 1010,
          "y": 656
        },
        {
          "x": 1010,
          "y": 661
        },
        {
          "x": 1049,
          "y": 661
        }
      ]
    },
    {
      "id": "Flow_1hkyzyg",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1wcu83c",
      "targetId": "Gateway_0dj9gz1",
      "waypoints": [
        {
          "x": 1919,
          "y": 531
        },
        {
          "x": 2109,
          "y": 531
        },
        {
          "x": 2109,
          "y": 651
        }
      ]
    },
    {
      "id": "Flow_024vnvy",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0uue82x",
      "targetId": "Activity_0jvwctq",
      "waypoints": [
        {
          "x": 1493,
          "y": 676
        },
        {
          "x": 1540,
          "y": 676
        },
        {
          "x": 1540,
          "y": 661
        },
        {
          "x": 1589,
          "y": 661
        }
      ]
    },
    {
      "id": "Flow_159d0d1",
      "kind": "sequenceFlow",
      "sourceId": "Activity_09nohhc",
      "targetId": "Activity_0v0o9vi",
      "waypoints": [
        {
          "x": 2443,
          "y": 296
        },
        {
          "x": 2523,
          "y": 296
        }
      ]
    },
    {
      "id": "Flow_00a2os2",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0j8zu62",
      "targetId": "Gateway_0dj9gz1",
      "waypoints": [
        {
          "x": 1894,
          "y": 676
        },
        {
          "x": 2084,
          "y": 676
        }
      ]
    },
    {
      "id": "Flow_17ynlmo",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0v0o9vi",
      "targetId": "Gateway_0kk3mw8",
      "waypoints": [
        {
          "x": 2623,
          "y": 296
        },
        {
          "x": 2690,
          "y": 296
        },
        {
          "x": 2690,
          "y": 311
        },
        {
          "x": 2758,
          "y": 311
        }
      ]
    },
    {
      "id": "Flow_1u0si80",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0ezguo2",
      "targetId": "Activity_0kdfhoe",
      "waypoints": [
        {
          "x": 1149,
          "y": 661
        },
        {
          "x": 1239,
          "y": 661
        }
      ]
    },
    {
      "id": "Flow_1qvj1ga",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0dj9gz1",
      "targetId": "Activity_09nohhc",
      "waypoints": [
        {
          "x": 2109,
          "y": 651
        },
        {
          "x": 2109,
          "y": 296
        },
        {
          "x": 2343,
          "y": 296
        }
      ]
    },
    {
      "id": "Flow_0f4ddxy",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0kk3mw8",
      "targetId": "Activity_164j62e",
      "waypoints": [
        {
          "x": 2783,
          "y": 336
        },
        {
          "x": 2783,
          "y": 410
        },
        {
          "x": 2743,
          "y": 410
        },
        {
          "x": 2743,
          "y": 491
        }
      ]
    },
    {
      "id": "Flow_1kxoo03",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0uue82x",
      "targetId": "Activity_0mr7v9y",
      "waypoints": [
        {
          "x": 1468,
          "y": 701
        },
        {
          "x": 1468,
          "y": 770
        }
      ]
    },
    {
      "id": "Flow_16crilx",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0vaye1j",
      "targetId": "Gateway_01e6c3d",
      "waypoints": [
        {
          "x": 2918,
          "y": 351
        },
        {
          "x": 2918,
          "y": 521
        }
      ]
    },
    {
      "id": "Flow_1x923t0",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0kdfhoe",
      "targetId": "Gateway_0uue82x",
      "waypoints": [
        {
          "x": 1339,
          "y": 661
        },
        {
          "x": 1390,
          "y": 661
        },
        {
          "x": 1390,
          "y": 676
        },
        {
          "x": 1443,
          "y": 676
        }
      ]
    },
    {
      "id": "Flow_1ct5v24",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0j8zu62",
      "targetId": "Activity_1wcu83c",
      "waypoints": [
        {
          "x": 1869,
          "y": 651
        },
        {
          "x": 1869,
          "y": 571
        }
      ]
    },
    {
      "id": "Flow_06b129s",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0jvwctq",
      "targetId": "Gateway_0j8zu62",
      "waypoints": [
        {
          "x": 1689,
          "y": 661
        },
        {
          "x": 1770,
          "y": 661
        },
        {
          "x": 1770,
          "y": 676
        },
        {
          "x": 1844,
          "y": 676
        }
      ]
    },
    {
      "id": "Flow_1o42euw",
      "kind": "sequenceFlow",
      "sourceId": "Activity_164j62e",
      "targetId": "Gateway_01e6c3d",
      "waypoints": [
        {
          "x": 2808,
          "y": 531
        },
        {
          "x": 2850,
          "y": 531
        },
        {
          "x": 2850,
          "y": 546
        },
        {
          "x": 2893,
          "y": 546
        }
      ]
    },
    {
      "id": "Flow_1kdjvfh",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0dj9gz1",
      "targetId": "Event_1j333xd",
      "waypoints": [
        {
          "x": 2109,
          "y": 701
        },
        {
          "x": 2109,
          "y": 729
        },
        {
          "x": 2560,
          "y": 729
        }
      ]
    },
    {
      "id": "Flow_0yrh820",
      "kind": "sequenceFlow",
      "sourceId": "Activity_09vjop1",
      "targetId": "Activity_1tfcgsk",
      "waypoints": [
        {
          "x": 7320,
          "y": 700
        },
        {
          "x": 7320,
          "y": 950
        }
      ]
    },
    {
      "id": "Flow_0wx10vs",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1tfcgsk",
      "targetId": "Activity_1d6uysn",
      "waypoints": [
        {
          "x": 7385,
          "y": 990
        },
        {
          "x": 7412,
          "y": 990
        },
        {
          "x": 7412,
          "y": -10
        },
        {
          "x": 7430,
          "y": -10
        }
      ]
    },
    {
      "id": "Flow_0cvxfsg",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1d6uysn",
      "targetId": "Gateway_0u7zcip",
      "waypoints": [
        {
          "x": 7530,
          "y": -10
        },
        {
          "x": 7875,
          "y": -10
        },
        {
          "x": 7875,
          "y": 425
        }
      ]
    },
    {
      "id": "Flow_0lne44o",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1eqn8ef",
      "targetId": "Gateway_0u7zcip",
      "waypoints": [
        {
          "x": 7710,
          "y": 450
        },
        {
          "x": 7850,
          "y": 450
        }
      ]
    },
    {
      "id": "Flow_02mv7cb",
      "kind": "sequenceFlow",
      "sourceId": "Gateway_0u7zcip",
      "targetId": "Activity_05lk1ui",
      "waypoints": [
        {
          "x": 7900,
          "y": 450
        },
        {
          "x": 7990,
          "y": 450
        }
      ]
    },
    {
      "id": "Flow_0c5n4bc",
      "kind": "sequenceFlow",
      "sourceId": "Activity_05lk1ui",
      "targetId": "Activity_16bkf36",
      "waypoints": [
        {
          "x": 8040,
          "y": 490
        },
        {
          "x": 8040,
          "y": 570
        }
      ]
    },
    {
      "id": "Flow_0pvf1dh",
      "kind": "sequenceFlow",
      "sourceId": "Activity_16bkf36",
      "targetId": "Activity_0bkh7kx",
      "waypoints": [
        {
          "x": 8090,
          "y": 610
        },
        {
          "x": 8140,
          "y": 610
        }
      ]
    },
    {
      "id": "Flow_0jvyaiw",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0bkh7kx",
      "targetId": "Activity_03llekp",
      "waypoints": [
        {
          "x": 8215,
          "y": 570
        },
        {
          "x": 8215,
          "y": 100
        }
      ]
    },
    {
      "id": "Flow_1eqmbwr",
      "kind": "sequenceFlow",
      "sourceId": "Activity_03llekp",
      "targetId": "Activity_06ium73",
      "waypoints": [
        {
          "x": 8265,
          "y": 60
        },
        {
          "x": 8312,
          "y": 60
        },
        {
          "x": 8312,
          "y": 390
        },
        {
          "x": 8350,
          "y": 390
        }
      ]
    },
    {
      "id": "Flow_16mopev",
      "kind": "sequenceFlow",
      "sourceId": "Activity_06ium73",
      "targetId": "Activity_0jjmsoc",
      "waypoints": [
        {
          "x": 8450,
          "y": 390
        },
        {
          "x": 8502,
          "y": 390
        },
        {
          "x": 8502,
          "y": 60
        },
        {
          "x": 8560,
          "y": 60
        }
      ]
    },
    {
      "id": "Flow_0exqsnp",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0jjmsoc",
      "targetId": "Activity_1m84zbc",
      "waypoints": [
        {
          "x": 8660,
          "y": 60
        },
        {
          "x": 8722,
          "y": 60
        },
        {
          "x": 8722,
          "y": 930
        },
        {
          "x": 8790,
          "y": 930
        }
      ]
    },
    {
      "id": "Flow_0gag8h4",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1m84zbc",
      "targetId": "Activity_0t60tni",
      "waypoints": [
        {
          "x": 8890,
          "y": 930
        },
        {
          "x": 8942,
          "y": 930
        },
        {
          "x": 8942,
          "y": 560
        },
        {
          "x": 9000,
          "y": 560
        }
      ]
    },
    {
      "id": "Flow_1r0mfqq",
      "kind": "sequenceFlow",
      "sourceId": "Activity_0t60tni",
      "targetId": "Activity_1wkkahd",
      "waypoints": [
        {
          "x": 9100,
          "y": 560
        },
        {
          "x": 9210,
          "y": 560
        }
      ]
    },
    {
      "id": "Flow_0mww31v",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1wkkahd",
      "targetId": "Event_1n46r9w",
      "waypoints": [
        {
          "x": 9310,
          "y": 560
        },
        {
          "x": 9454,
          "y": 560
        }
      ]
    },
    {
      "id": "Flow_0d26qon",
      "kind": "sequenceFlow",
      "sourceId": "Activity_1ejspav",
      "targetId": "Activity_09vjop1",
      "waypoints": [
        {
          "x": 7160,
          "y": 660
        },
        {
          "x": 7270,
          "y": 660
        }
      ]
    },
    {
      "id": "Flow_14auc25",
      "kind": "sequenceFlow",
      "sourceId": "Event_1a1gr89",
      "targetId": "Activity_1eqn8ef",
      "waypoints": [
        {
          "x": 7480,
          "y": 48
        },
        {
          "x": 7480,
          "y": 450
        },
        {
          "x": 7610,
          "y": 450
        }
      ]
    }
  ];
