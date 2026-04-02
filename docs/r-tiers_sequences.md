# R-tier Sequences (Session afbb609e19)

## Определения R0/R1/R2
- **R0**: идеальный/основной путь до успешного завершения.
- **R1**: успешный путь с контролируемым ответвлением и возвратом на mainline.
- **R2**: неуспех/эскалация до stop-node.
- Нормализация для этого отчёта: R0~P0, R1~P1, R2~P2 (если meta tiers присутствуют). В выбранной сессии meta tiers отсутствуют.

## Сводка по процессу
- Session: `afbb609e19`
- Title: E2E big matrix session 1771633871241_ug5yek
- Source JSON: `workspace/.session_store/afbb609e19.json`
- Selected start node: `Event_05ckyt4` (Заказ на суп)
- Reachable nodes from selected start: 83
- Reachable sequence flows from selected start: 92
- Reachable gateways (split): 12
- Reachable end nodes: `Event_1aulnyq`, `Event_1pqduoq`
- Success target (for R0/R1): `Event_1pqduoq`
- Stop target (for R2): `Event_1aulnyq`
- Meta flow tiers in session `bpmn_meta.flow_meta`: 0
- Interview numbering source: `interview.path_spec.steps[].order_index -> bpmn_ref` (125 nodes mapped)

## Узлы (nodeId, name, type, lane, graphNo)
| nodeId | name | type | lane | graphNo |
| --- | --- | --- | --- | --- |
| Event_05ckyt4 | Заказ на суп | startEvent | Работа сотрудника | 1 |
| Event_0n3sbnt | Звуковой сигнал о новом заказе | intermediateCatchEvent | Работа сотрудника | 43 |
| Activity_01pgxk6 | Сотрудник подходит к компьютеру | userTask | Работа сотрудника | 44 |
| Activity_0m37490 | Посмотреть состав заказа в ВВ партнер | userTask | Работа программы сборки | 45 |
| Activity_17t320o | Нажать кнопку "Начать сборку" | manualTask | Работа программы сборки | 46 |
| Gateway_0d27wqt | Появилась кнопка "передать в доставку"? | exclusiveGateway | Работа программы сборки | 47 |
| Activity_1k9t4a7 | Открыть холодильник заморозки | manualTask | Работа с оборудованием | 50 |
| Activity_1udbo2p | Взять необходимый суп с полки | manualTask | Работа сотрудника | 51 |
| Activity_0ruygy4 | Взять нож | manualTask | Работа сотрудника | 52 |
| Activity_0lejb47 | Отрезать плёнку | manualTask | Работа сотрудника | 53 |
| Activity_177u5au | Выкинуть плёнку/крышку в мусорный бак | userTask | Работа сотрудника | 54 |
| Activity_0w4rqcg | Открыть крышку | manualTask | Работа сотрудника | 55 |
| Activity_06qnbnf | Положить нож | manualTask | Работа сотрудника | 56 |
| Activity_1tghc67 | Открыть СВЧ печь | manualTask | Работа с оборудованием | 57 |
| Activity_1gmqktc | Открыть СВЧ печь | manualTask | Работа с оборудованием | 58 |
| Activity_1r18m6r | Поставить контейнер и крышку в зону сборки | manualTask | Работа сотрудника | 59 |
| Activity_0jgi0rk | Взять контейнер и крышку для покупателя | manualTask | Работа сотрудника | 60 |
| Activity_1sne2zz | Взять разогретый суп (достать из СВЧ) | manualTask | Работа сотрудника | 61 |
| Activity_1fbaouj | Нажать повторно кнопку "Начать сборку" | manualTask | Работа программы сборки | 62 |
| Activity_0zaagzy | Повторить/обновить/позвать старшего | userTask | Работа программы сборки | 63 |
| Activity_1273na5 | Перенести в зону сборки | manualTask | Работа сотрудника | 64 |
| Activity_0flva8y | Закрыть СВЧ печь | manualTask | Работа с оборудованием | 65 |
| Activity_03ibxr5 | Убедиться в температуре выше 75С* | userTask | Работа сотрудника | 66 |
| Activity_18eb7rc | Нажать педаль мусорки | manualTask | Работа сотрудника | 67 |
| Activity_1ohf6pd | Подойти к мусорке | userTask | Работа сотрудника | 68 |
| Activity_00xx7nl | Переместить открытый суп к СВЧ печи | manualTask | Работа сотрудника | 69 |
| Activity_1nmuo3d | Взять разогретый суп (горячую тару для перелива) | manualTask | Работа сотрудника | 70 |
| Activity_171znbt | Перелить суп в контейнер для покупателя | manualTask | Работа сотрудника | 71 |
| Activity_1ob89db | Перенести суп над контейнером для покупателя | manualTask | Работа сотрудника | 72 |
| Activity_0th269d | Взять старую тару (в которой разогревался суп) | manualTask | Работа сотрудника | 73 |
| Activity_0nux093 | Убедится , что суп плотно закрыт | userTask | Работа сотрудника | 74 |
| Activity_1croc09 | Укупорить суп | manualTask | Работа сотрудника | 75 |
| Activity_0uewbw6 | Взять крышку от контейнера | manualTask | Работа сотрудника | 76 |
| Activity_1qejxgi | Подойти к мусорке | manualTask | Работа сотрудника | 77 |
| Activity_0ew2wl3 | Нажать педали мусорки | manualTask | Работа сотрудника | 78 |
| Activity_10pdewi | Выбросить тару в мусорку | manualTask | Работа сотрудника | 79 |
| Activity_0q42vv3 | Освободить мусорку от мусора | manualTask | Работа сотрудника | 80 |
| Activity_0ksn5ed | Наклеить этикетку на крышку банки с супом | manualTask | Работа сотрудника | 81 |
| Activity_1019azk | Взять фольгированный пакет | manualTask | Работа сотрудника | 82 |
| Activity_12z3j99 | Открыть пакет | manualTask | Работа сотрудника | 83 |
| Activity_1kp4c93 | Взять суп | manualTask | Работа сотрудника | 84 |
| Activity_0ppebcj | Вложить суп в пакет | manualTask | Работа сотрудника | 85 |
| Activity_0697vcq | подойти к компьютеру | userTask | Работа сотрудника | 86 |
| Activity_1gwr8or | нажать печать этикетки | manualTask | Работа программы сборки | 87 |
| Activity_0mdfih5 | Забрать этикетку | manualTask | Работа сотрудника | 88 |
| Activity_1u7tw5g | Термопринтер печатает этикетку | serviceTask | Работа с оборудованием | 89 |
| Activity_0mzydsr | Наклеить этикетку на пакет | manualTask | Работа сотрудника | 90 |
| Activity_0adbnrz | Распечатать этикетку курьеру | manualTask | Работа программы сборки | 91 |
| Activity_0i0it93 | Открыть тепловой шкаф | manualTask | Работа с оборудованием | 92 |
| Activity_1r77ain | Поставить пакет в тепловой шкаф | manualTask | Работа сотрудника | 93 |
| Activity_05n0ofa | Дефект тары | subProcess | Работа сотрудника | 94 |
| Activity_1am80pn | Добавление приборов в заказ | subProcess | Работа сотрудника | 95 |
| Activity_0xfsp1b | Добавление топпингов | subProcess | Работа сотрудника | 96 |
| Activity_00t6ixs | Мойка поверхностей | subProcess | Работа сотрудника | 97 |
| Activity_1spcm9y | Открыть пленку | manualTask | Работа сотрудника | 98 |
| Activity_0hw9udd | Закрыть пакет | manualTask | Работа сотрудника | 99 |
| Activity_1tsk3kf | Поставить в СВЧ | manualTask | Работа с оборудованием | 100 |
| Activity_1jw2q8u | Закрыть СВЧ печь | manualTask | Работа с оборудованием | 101 |
| Activity_0238wyw | Установить мощность/ таймер разогрева | manualTask | Работа с оборудованием | 102 |
| Activity_07dw2ru | Запустить СВЧ печь | manualTask | Работа с оборудованием | 103 |
| Activity_0871wl8 | Разогреть суп повторно | userTask | Работа сотрудника | 104 |
| Activity_0nrtdbw | Взять термощуп и измерить температуру в центре супа | manualTask | Работа сотрудника | 105 |
| Activity_1ixcfjj | Нажать “заказ готов” | manualTask | Работа программы сборки | 106 |
| Activity_1d89hw2 | Закрыть тепловой шкаф | manualTask | Работа с оборудованием | 107 |
| Gateway_1qzyii9 | Какой вид тары? | exclusiveGateway | Работа сотрудника | 108 |
| Gateway_1ga44yx | Проверка перед взятием. Есть явная протечка/деформация тары? | exclusiveGateway | Работа сотрудника | 109 |
| Gateway_0yfbohy | Появилась кнопка "передать в доставку"? | exclusiveGateway | Работа программы сборки | 110 |
| Gateway_1prds00 | Проблема решена? | exclusiveGateway | Работа программы сборки | 111 |
| Gateway_03ygf9x | Есть пар,<br/>Пятнышки масла на поверхности , отсутствие льдышки | exclusiveGateway | Работа сотрудника | 112 |
| Gateway_1w0fah0 | Температура выше 75 градусов? | exclusiveGateway | Работа сотрудника | 113 |
| Gateway_1idc4ex | Мусорка переполнена ? | exclusiveGateway | Работа сотрудника | 114 |
| Gateway_13frvr2 | Нужны топпинги? | exclusiveGateway | Работа сотрудника | 115 |
| Gateway_1kdlvf8 | Нужны приборы? | exclusiveGateway | Работа сотрудника | 116 |
| Gateway_0vjlz9j | — | exclusiveGateway | Работа с оборудованием | 117 |
| Gateway_1tys43i | — | exclusiveGateway | Работа сотрудника | 118 |
| Gateway_1gg4hkp | Плёнка открывается руками? | exclusiveGateway | Работа сотрудника | 119 |
| Gateway_1fzg4ur | — | exclusiveGateway | Работа сотрудника | 120 |
| Gateway_0a36kt8 | — | exclusiveGateway | Работа сотрудника | 121 |
| Gateway_1yytlts | Параллельный процесс | parallelGateway | Работа с оборудованием | 122 |
| Event_1w6bow6 | RESTART_SOUP | intermediateThrowEvent | Работа сотрудника | 123 |
| Event_0pmnxet | warming_up_soup | intermediateThrowEvent | Работа сотрудника | 124 |
| Event_1pqduoq | Процесс завершён | endEvent | Работа сотрудника | 125 |
| Event_1aulnyq | — | endEvent | Работа программы сборки | — |

## Sequence Flows (flowId, from, to, label/condition, default, R-tier)
| flowId | from | to | label/condition | default? | R-tier | meta-tier |
| --- | --- | --- | --- | --- | --- | --- |
| Flow_1f9se1h | Event_05ckyt4 | Event_0n3sbnt | — | no | R0/R1/R2 | — |
| Flow_1opvtxu | Event_0n3sbnt | Activity_01pgxk6 | — | no | R0/R1/R2 | — |
| Flow_00ntdu7 | Activity_01pgxk6 | Activity_0m37490 | — | no | R0/R1/R2 | — |
| Flow_0uo9mwm | Activity_0m37490 | Activity_17t320o | — | no | R0/R1/R2 | — |
| Flow_194a7it | Activity_17t320o | Gateway_0d27wqt | 2 секунды | no | R0/R1/R2 | — |
| Flow_1einwy2 | Gateway_0d27wqt | Activity_1fbaouj | Нет | no | R1/R2 | — |
| Flow_168fa3r | Gateway_0d27wqt | Gateway_0vjlz9j | Да | no | R0 | — |
| Flow_09p0qmq | Activity_1k9t4a7 | Activity_1udbo2p | — | no | R0/R1 | — |
| Flow_1nbfieu | Activity_1udbo2p | Gateway_1qzyii9 | — | no | R0/R1 | — |
| Flow_01rtq8i | Activity_0ruygy4 | Activity_0lejb47 | — | no | — | — |
| Flow_14d5hmj | Activity_0lejb47 | Activity_06qnbnf | — | no | — | — |
| Flow_1i5ed5u | Activity_177u5au | Activity_00xx7nl | — | no | R0/R1 | — |
| Flow_0vfifyv | Activity_0w4rqcg | Gateway_1tys43i | — | no | R0/R1 | — |
| Flow_0sgjtr9 | Activity_06qnbnf | Activity_1ohf6pd | — | no | — | — |
| Flow_002q8sl | Activity_1tghc67 | Activity_1tsk3kf | — | no | R0/R1 | — |
| Flow_0gsexs8 | Activity_1gmqktc | Activity_1sne2zz | — | no | R0/R1 | — |
| Flow_19o4n0j | Activity_1r18m6r | Activity_1gmqktc | — | no | — | — |
| Flow_0tzrkqp | Activity_0jgi0rk | Activity_1r18m6r | — | no | — | — |
| Flow_02bvvns | Activity_1sne2zz | Gateway_1ga44yx | — | no | R0/R1 | — |
| Flow_0c3fhuz | Activity_1fbaouj | Gateway_0yfbohy | — | no | R1/R2 | — |
| Flow_08gov38 | Activity_0zaagzy | Gateway_1prds00 | — | no | R2 | — |
| Flow_036ylsh | Activity_1273na5 | Activity_0flva8y | — | no | R0/R1 | — |
| Flow_0kd4icx | Activity_0flva8y | Activity_03ibxr5 | закрылось | no | R0/R1 | — |
| Flow_0673ko3 | Activity_03ibxr5 | Gateway_03ygf9x | — | no | R0/R1 | — |
| Flow_0819bqp | Activity_18eb7rc | Activity_177u5au | — | no | — | — |
| Flow_1llsxhn | Activity_1ohf6pd | Activity_18eb7rc | — | no | — | — |
| Flow_0uos5tk | Activity_00xx7nl | Activity_1tghc67 | тара поставлена в точку у СВЧ/перед СВЧ | no | R0/R1 | — |
| Flow_0coo0b3 | Activity_1nmuo3d | Activity_1ob89db | — | no | R0/R1 | — |
| Flow_1rfanib | Activity_171znbt | Activity_0uewbw6 | суп перелит, визуально нет пролива вне контейнера | no | R0/R1 | — |
| Flow_0psw6u7 | Activity_1ob89db | Activity_171znbt | Суп не пролился при переносе | no | R0/R1 | — |
| Flow_0ozf2dx | Activity_0th269d | Activity_1qejxgi | — | no | R0/R1 | — |
| Flow_1p5bvvq | Activity_0nux093 | Activity_0th269d | при наклоне (с удержанием крышки) нет подтеков, визуально крышка сидит ровно. | no | R0/R1 | — |
| Flow_01onqsx | Activity_1croc09 | Activity_0nux093 | закрытие = щелчок + визуальный контроль (если перекос - видно) | no | R0/R1 | — |
| Flow_19kakgx | Activity_0uewbw6 | Activity_1croc09 | крышка в руках, ориентирована под закрытие. | no | R0/R1 | — |
| Flow_17nfywd | Activity_1qejxgi | Activity_0ew2wl3 | — | no | R0/R1 | — |
| Flow_0yo37n6 | Activity_0ew2wl3 | Gateway_1idc4ex | — | no | R0/R1 | — |
| Flow_0x3uer0 | Activity_10pdewi | Activity_0697vcq | — | no | R0/R1 | — |
| Flow_1tjr1ou | Activity_0q42vv3 | Activity_10pdewi | В мусорке есть место | no | — | — |
| Flow_0juhkmb | Activity_0ksn5ed | Activity_1019azk | наклеена корректно | no | R0/R1 | — |
| Flow_0arviz6 | Activity_1019azk | Activity_12z3j99 | — | no | R0/R1 | — |
| Flow_02iprom | Activity_12z3j99 | Activity_1kp4c93 | — | no | R0/R1 | — |
| Flow_0f8zrme | Activity_1kp4c93 | Activity_0ppebcj | пакет целый, без прокола | no | R0/R1 | — |
| Flow_05uk8kz | Activity_0ppebcj | Gateway_13frvr2 | — | no | R0/R1 | — |
| Flow_07bbkam | Activity_0697vcq | Activity_1gwr8or | — | no | R0/R1 | — |
| Flow_1kgklrw | Activity_1gwr8or | Activity_1u7tw5g | — | no | R0/R1 | — |
| Flow_04ui7gq | Activity_0mdfih5 | Activity_0ksn5ed | — | no | R0/R1 | — |
| Flow_060vdo7 | Activity_1u7tw5g | Activity_0mdfih5 | этикетка напечатана читабельно | no | R0/R1 | — |
| Flow_01k4laz | Activity_0mzydsr | Activity_0i0it93 | — | no | R0/R1 | — |
| Flow_1qyipl7 | Activity_0adbnrz | Activity_0mzydsr | — | no | R0/R1 | — |
| Flow_1ub7gwa | Activity_0i0it93 | Activity_1r77ain | — | no | R0/R1 | — |
| Flow_02du2dp | Activity_1r77ain | Activity_1d89hw2 | — | no | R0/R1 | — |
| Flow_1r75qtq | Activity_05n0ofa | Event_1w6bow6 | — | no | — | — |
| Flow_03ry8s4 | Activity_1am80pn | Gateway_1fzg4ur | — | no | — | — |
| Flow_0t2ojxw | Activity_0xfsp1b | Gateway_1kdlvf8 | — | no | — | — |
| Flow_11yxlz6 | Activity_0xfsp1b | Gateway_1fzg4ur | — | no | — | — |
| Flow_1ndeuot | Activity_00t6ixs | Event_1pqduoq | — | no | R0/R1 | — |
| Flow_1xzzt2q | Activity_1spcm9y | Gateway_1gg4hkp | плёнка снята полностью, край банки чистый; нет фрагментов плёнки. | no | — | — |
| Flow_1lmi10n | Activity_0hw9udd | Activity_0adbnrz | — | no | R0/R1 | — |
| Flow_01z2bfy | Activity_1tsk3kf | Activity_1jw2q8u | — | no | R0/R1 | — |
| Flow_0bpycud | Activity_1jw2q8u | Activity_0238wyw | дверь закрыта, “щелчок/замок”, печь готова стартовать. | no | R0/R1 | — |
| Flow_1l3471u | Activity_0238wyw | Activity_07dw2ru | — | no | R0/R1 | — |
| Flow_0qbk0qe | Activity_07dw2ru | Gateway_1yytlts | — | no | R0/R1 | — |
| Flow_12zwpjn | Activity_0871wl8 | Gateway_0a36kt8 | — | no | — | — |
| Flow_1n8vuer | Activity_0nrtdbw | Gateway_1w0fah0 | — | no | R0/R1 | — |
| Flow_1cz5s63 | Activity_1ixcfjj | Activity_00t6ixs | — | no | R0/R1 | — |
| Flow_0pru7c3 | Activity_1d89hw2 | Activity_1ixcfjj | заказ размещён в правильной ячейке/полке, дверца закрыта. | no | R0/R1 | — |
| Flow_0permcn | Gateway_1qzyii9 | Activity_0w4rqcg | С крышкой | no | R0/R1 | — |
| Flow_10btf9s | Gateway_1qzyii9 | Activity_1spcm9y | С пленкой | no | — | — |
| Flow_0nug5zp | Gateway_1ga44yx | Activity_1273na5 | Нет | no | R0/R1 | — |
| Flow_03cu8rc | Gateway_1ga44yx | Activity_05n0ofa | — | no | — | — |
| Flow_1nlxxyj | Gateway_0yfbohy | Activity_0zaagzy | Нет | no | R2 | — |
| Flow_1qethxe | Gateway_0yfbohy | Gateway_0vjlz9j | Да | no | R1 | — |
| Flow_0izieol | Gateway_1prds00 | Activity_1fbaouj | Да | no | — | — |
| Flow_02mqvh5 | Gateway_1prds00 | Event_1aulnyq | Нет | no | R2 | — |
| Flow_0si8b9h | Gateway_03ygf9x | Activity_0871wl8 | Нет | no | — | — |
| Flow_0i8zyee | Gateway_03ygf9x | Activity_0nrtdbw | Да | no | R0/R1 | — |
| Flow_0ccm7n7 | Gateway_1w0fah0 | Activity_1nmuo3d | Да | no | R0/R1 | — |
| Flow_04lmgnm | Gateway_1w0fah0 | Gateway_0a36kt8 | Нет | no | — | — |
| Flow_1uz1iaf | Gateway_1idc4ex | Activity_10pdewi | Нет | no | R0/R1 | — |
| Flow_02aktpm | Gateway_1idc4ex | Activity_0q42vv3 | Да | no | — | — |
| Flow_18fb85f | Gateway_13frvr2 | Activity_0xfsp1b | Да | no | — | — |
| Flow_1pc3ucn | Gateway_13frvr2 | Gateway_1kdlvf8 | Нет | no | R0/R1 | — |
| Flow_05e6udz | Gateway_1kdlvf8 | Activity_1am80pn | — | no | — | — |
| Flow_175fc18 | Gateway_1kdlvf8 | Activity_0hw9udd | Нет | no | R0/R1 | — |
| Flow_1ths047 | Gateway_0vjlz9j | Activity_1k9t4a7 | — | no | R0/R1 | — |
| Flow_0209707 | Gateway_1tys43i | Activity_177u5au | — | no | R0/R1 | — |
| Flow_1ns5s92 | Gateway_1gg4hkp | Activity_0ruygy4 | Нет | no | — | — |
| Flow_0alxc6g | Gateway_1gg4hkp | Gateway_1tys43i | Да | no | — | — |
| Flow_1po84b3 | Gateway_1fzg4ur | Activity_0hw9udd | — | no | — | — |
| Flow_1a38c6j | Gateway_0a36kt8 | Event_0pmnxet | — | no | — | — |
| Flow_1clboby | Gateway_1yytlts | Activity_1gmqktc | — | no | R0/R1 | — |
| Flow_0pbc1ut | Gateway_1yytlts | Activity_0jgi0rk | подготовить контейнер покупателя” | no | — | — |

## Graph model (incoming/outgoing per node)
| nodeId | incomingFlowIds | outgoingFlowIds |
| --- | --- | --- |
| Event_05ckyt4 | — | Flow_1f9se1h |
| Event_0n3sbnt | Flow_1f9se1h | Flow_1opvtxu |
| Activity_01pgxk6 | Flow_1opvtxu | Flow_00ntdu7 |
| Activity_0m37490 | Flow_00ntdu7 | Flow_0uo9mwm |
| Activity_17t320o | Flow_0uo9mwm | Flow_194a7it |
| Gateway_0d27wqt | Flow_194a7it | Flow_168fa3r, Flow_1einwy2 |
| Activity_1k9t4a7 | Flow_1ths047 | Flow_09p0qmq |
| Activity_1udbo2p | Flow_09p0qmq | Flow_1nbfieu |
| Activity_0ruygy4 | Flow_1ns5s92 | Flow_01rtq8i |
| Activity_0lejb47 | Flow_01rtq8i | Flow_14d5hmj |
| Activity_177u5au | Flow_0819bqp, Flow_0209707 | Flow_1i5ed5u |
| Activity_0w4rqcg | Flow_0permcn | Flow_0vfifyv |
| Activity_06qnbnf | Flow_14d5hmj | Flow_0sgjtr9 |
| Activity_1tghc67 | Flow_0uos5tk | Flow_002q8sl |
| Activity_1gmqktc | Flow_1clboby, Flow_19o4n0j | Flow_0gsexs8 |
| Activity_1r18m6r | Flow_0tzrkqp | Flow_19o4n0j |
| Activity_0jgi0rk | Flow_0pbc1ut | Flow_0tzrkqp |
| Activity_1sne2zz | Flow_0gsexs8 | Flow_02bvvns |
| Activity_1fbaouj | Flow_1einwy2, Flow_0izieol | Flow_0c3fhuz |
| Activity_0zaagzy | Flow_1nlxxyj | Flow_08gov38 |
| Activity_1273na5 | Flow_0nug5zp | Flow_036ylsh |
| Activity_0flva8y | Flow_036ylsh | Flow_0kd4icx |
| Activity_03ibxr5 | Flow_0kd4icx | Flow_0673ko3 |
| Activity_18eb7rc | Flow_1llsxhn | Flow_0819bqp |
| Activity_1ohf6pd | Flow_0sgjtr9 | Flow_1llsxhn |
| Activity_00xx7nl | Flow_1i5ed5u | Flow_0uos5tk |
| Activity_1nmuo3d | Flow_0ccm7n7 | Flow_0coo0b3 |
| Activity_171znbt | Flow_0psw6u7 | Flow_1rfanib |
| Activity_1ob89db | Flow_0coo0b3 | Flow_0psw6u7 |
| Activity_0th269d | Flow_1p5bvvq | Flow_0ozf2dx |
| Activity_0nux093 | Flow_01onqsx | Flow_1p5bvvq |
| Activity_1croc09 | Flow_19kakgx | Flow_01onqsx |
| Activity_0uewbw6 | Flow_1rfanib | Flow_19kakgx |
| Activity_1qejxgi | Flow_0ozf2dx | Flow_17nfywd |
| Activity_0ew2wl3 | Flow_17nfywd | Flow_0yo37n6 |
| Activity_10pdewi | Flow_1uz1iaf, Flow_1tjr1ou | Flow_0x3uer0 |
| Activity_0q42vv3 | Flow_02aktpm | Flow_1tjr1ou |
| Activity_0ksn5ed | Flow_04ui7gq | Flow_0juhkmb |
| Activity_1019azk | Flow_0juhkmb | Flow_0arviz6 |
| Activity_12z3j99 | Flow_0arviz6 | Flow_02iprom |
| Activity_1kp4c93 | Flow_02iprom | Flow_0f8zrme |
| Activity_0ppebcj | Flow_0f8zrme | Flow_05uk8kz |
| Activity_0697vcq | Flow_0x3uer0 | Flow_07bbkam |
| Activity_1gwr8or | Flow_07bbkam | Flow_1kgklrw |
| Activity_0mdfih5 | Flow_060vdo7 | Flow_04ui7gq |
| Activity_1u7tw5g | Flow_1kgklrw | Flow_060vdo7 |
| Activity_0mzydsr | Flow_1qyipl7 | Flow_01k4laz |
| Activity_0adbnrz | Flow_1lmi10n | Flow_1qyipl7 |
| Activity_0i0it93 | Flow_01k4laz | Flow_1ub7gwa |
| Activity_1r77ain | Flow_1ub7gwa | Flow_02du2dp |
| Activity_05n0ofa | Flow_03cu8rc | Flow_1r75qtq |
| Activity_1am80pn | Flow_05e6udz | Flow_03ry8s4 |
| Activity_0xfsp1b | Flow_18fb85f | Flow_0t2ojxw, Flow_11yxlz6 |
| Activity_00t6ixs | Flow_1cz5s63 | Flow_1ndeuot |
| Activity_1spcm9y | Flow_10btf9s | Flow_1xzzt2q |
| Activity_0hw9udd | Flow_175fc18, Flow_1po84b3 | Flow_1lmi10n |
| Activity_1tsk3kf | Flow_002q8sl | Flow_01z2bfy |
| Activity_1jw2q8u | Flow_01z2bfy | Flow_0bpycud |
| Activity_0238wyw | Flow_0bpycud | Flow_1l3471u |
| Activity_07dw2ru | Flow_1l3471u | Flow_0qbk0qe |
| Activity_0871wl8 | Flow_0si8b9h | Flow_12zwpjn |
| Activity_0nrtdbw | Flow_0i8zyee | Flow_1n8vuer |
| Activity_1ixcfjj | Flow_0pru7c3 | Flow_1cz5s63 |
| Activity_1d89hw2 | Flow_02du2dp | Flow_0pru7c3 |
| Gateway_1qzyii9 | Flow_1nbfieu | Flow_0permcn, Flow_10btf9s |
| Gateway_1ga44yx | Flow_02bvvns | Flow_0nug5zp, Flow_03cu8rc |
| Gateway_0yfbohy | Flow_0c3fhuz | Flow_1qethxe, Flow_1nlxxyj |
| Gateway_1prds00 | Flow_08gov38 | Flow_0izieol, Flow_02mqvh5 |
| Gateway_03ygf9x | Flow_0673ko3 | Flow_0i8zyee, Flow_0si8b9h |
| Gateway_1w0fah0 | Flow_1n8vuer | Flow_04lmgnm, Flow_0ccm7n7 |
| Gateway_1idc4ex | Flow_0yo37n6 | Flow_1uz1iaf, Flow_02aktpm |
| Gateway_13frvr2 | Flow_05uk8kz | Flow_18fb85f, Flow_1pc3ucn |
| Gateway_1kdlvf8 | Flow_1pc3ucn, Flow_0t2ojxw | Flow_05e6udz, Flow_175fc18 |
| Gateway_0vjlz9j | Flow_168fa3r, Flow_1qethxe | Flow_1ths047 |
| Gateway_1tys43i | Flow_0alxc6g, Flow_0vfifyv | Flow_0209707 |
| Gateway_1gg4hkp | Flow_1xzzt2q | Flow_0alxc6g, Flow_1ns5s92 |
| Gateway_1fzg4ur | Flow_03ry8s4, Flow_11yxlz6 | Flow_1po84b3 |
| Gateway_0a36kt8 | Flow_12zwpjn, Flow_04lmgnm | Flow_1a38c6j |
| Gateway_1yytlts | Flow_0qbk0qe | Flow_0pbc1ut, Flow_1clboby |
| Event_1w6bow6 | Flow_1r75qtq | — |
| Event_0pmnxet | Flow_1a38c6j | — |
| Event_1pqduoq | Flow_1ndeuot | — |
| Event_1aulnyq | Flow_02mqvh5 | — |

## Decision points
| gatewayId | name/type | outgoing flows (flowId,label,target,R-tier) | выбор в трассах R0/R1/R2 |
| --- | --- | --- | --- |
| Gateway_0d27wqt | Появилась кнопка "передать в доставку"? / exclusiveGateway | Flow_168fa3r [Да] => Gateway_0vjlz9j :: R0<br/>Flow_1einwy2 [Нет] => Activity_1fbaouj :: R1/R2 | R0: Flow_168fa3r<br/>R1: Flow_1einwy2<br/>R2: Flow_1einwy2 |
| Gateway_1qzyii9 | Какой вид тары? / exclusiveGateway | Flow_0permcn [С крышкой] => Activity_0w4rqcg :: R0/R1<br/>Flow_10btf9s [С пленкой] => Activity_1spcm9y :: — | R0: Flow_0permcn<br/>R1: Flow_0permcn<br/>R2: — |
| Gateway_1ga44yx | Проверка перед взятием. Есть явная протечка/деформация тары? / exclusiveGateway | Flow_0nug5zp [Нет] => Activity_1273na5 :: R0/R1<br/>Flow_03cu8rc [—] => Activity_05n0ofa :: — | R0: Flow_0nug5zp<br/>R1: Flow_0nug5zp<br/>R2: — |
| Gateway_0yfbohy | Появилась кнопка "передать в доставку"? / exclusiveGateway | Flow_1qethxe [Да] => Gateway_0vjlz9j :: R1<br/>Flow_1nlxxyj [Нет] => Activity_0zaagzy :: R2 | R0: —<br/>R1: Flow_1qethxe<br/>R2: Flow_1nlxxyj |
| Gateway_1prds00 | Проблема решена? / exclusiveGateway | Flow_0izieol [Да] => Activity_1fbaouj :: —<br/>Flow_02mqvh5 [Нет] => Event_1aulnyq :: R2 | R0: —<br/>R1: —<br/>R2: Flow_02mqvh5 |
| Gateway_03ygf9x | Есть пар,<br/>Пятнышки масла на поверхности , отсутствие льдышки / exclusiveGateway | Flow_0i8zyee [Да] => Activity_0nrtdbw :: R0/R1<br/>Flow_0si8b9h [Нет] => Activity_0871wl8 :: — | R0: Flow_0i8zyee<br/>R1: Flow_0i8zyee<br/>R2: — |
| Gateway_1w0fah0 | Температура выше 75 градусов? / exclusiveGateway | Flow_04lmgnm [Нет] => Gateway_0a36kt8 :: —<br/>Flow_0ccm7n7 [Да] => Activity_1nmuo3d :: R0/R1 | R0: Flow_0ccm7n7<br/>R1: Flow_0ccm7n7<br/>R2: — |
| Gateway_1idc4ex | Мусорка переполнена ? / exclusiveGateway | Flow_1uz1iaf [Нет] => Activity_10pdewi :: R0/R1<br/>Flow_02aktpm [Да] => Activity_0q42vv3 :: — | R0: Flow_1uz1iaf<br/>R1: Flow_1uz1iaf<br/>R2: — |
| Gateway_13frvr2 | Нужны топпинги? / exclusiveGateway | Flow_18fb85f [Да] => Activity_0xfsp1b :: —<br/>Flow_1pc3ucn [Нет] => Gateway_1kdlvf8 :: R0/R1 | R0: Flow_1pc3ucn<br/>R1: Flow_1pc3ucn<br/>R2: — |
| Gateway_1kdlvf8 | Нужны приборы? / exclusiveGateway | Flow_05e6udz [—] => Activity_1am80pn :: —<br/>Flow_175fc18 [Нет] => Activity_0hw9udd :: R0/R1 | R0: Flow_175fc18<br/>R1: Flow_175fc18<br/>R2: — |
| Gateway_1gg4hkp | Плёнка открывается руками? / exclusiveGateway | Flow_0alxc6g [Да] => Gateway_1tys43i :: —<br/>Flow_1ns5s92 [Нет] => Activity_0ruygy4 :: — | R0: —<br/>R1: —<br/>R2: — |
| Gateway_1yytlts | Параллельный процесс / parallelGateway | Flow_0pbc1ut [подготовить контейнер покупателя”] => Activity_0jgi0rk :: —<br/>Flow_1clboby [—] => Activity_1gmqktc :: R0/R1 | R0: Flow_1clboby<br/>R1: Flow_1clboby<br/>R2: — |

## Loop detection (ограничение 1 итерацией)
| loopId | nodeIds | nodes | rule |
| --- | --- | --- | --- |
| SCC_1 | Gateway_1prds00, Activity_0zaagzy, Gateway_0yfbohy, Activity_1fbaouj | Gateway_1prds00 (Проблема решена?)<br/>Activity_0zaagzy (Повторить/обновить/позвать старшего)<br/>Gateway_0yfbohy (Появилась кнопка "передать в доставку"?)<br/>Activity_1fbaouj (Нажать повторно кнопку "Начать сборку") | max 1 iteration in trace builder |

## R0 Trace
### R0 #1
- nodeId: `Event_05ckyt4`
- title: Заказ на суп
- lane: Работа сотрудника
- viaFlowId: —
- branchContext: —
- graphNo: 1
- stopReason: —

### R0 #2
- nodeId: `Event_0n3sbnt`
- title: Звуковой сигнал о новом заказе
- lane: Работа сотрудника
- viaFlowId: Flow_1f9se1h
- branchContext: —
- graphNo: 43
- stopReason: —

### R0 #3
- nodeId: `Activity_01pgxk6`
- title: Сотрудник подходит к компьютеру
- lane: Работа сотрудника
- viaFlowId: Flow_1opvtxu
- branchContext: —
- graphNo: 44
- stopReason: —

### R0 #4
- nodeId: `Activity_0m37490`
- title: Посмотреть состав заказа в ВВ партнер
- lane: Работа программы сборки
- viaFlowId: Flow_00ntdu7
- branchContext: —
- graphNo: 45
- stopReason: —

### R0 #5
- nodeId: `Activity_17t320o`
- title: Нажать кнопку "Начать сборку"
- lane: Работа программы сборки
- viaFlowId: Flow_0uo9mwm
- branchContext: —
- graphNo: 46
- stopReason: —

### R0 #6
- nodeId: `Gateway_0d27wqt`
- title: Появилась кнопка "передать в доставку"?
- lane: Работа программы сборки
- viaFlowId: Flow_194a7it
- branchContext: —
- graphNo: 47
- stopReason: —

### R0 #7
- nodeId: `Gateway_0vjlz9j`
- title: Gateway_0vjlz9j
- lane: Работа с оборудованием
- viaFlowId: Flow_168fa3r
- branchContext: Gateway_0d27wqt :: Да
- graphNo: 117
- stopReason: —

### R0 #8
- nodeId: `Activity_1k9t4a7`
- title: Открыть холодильник заморозки
- lane: Работа с оборудованием
- viaFlowId: Flow_1ths047
- branchContext: —
- graphNo: 50
- stopReason: —

### R0 #9
- nodeId: `Activity_1udbo2p`
- title: Взять необходимый суп с полки
- lane: Работа сотрудника
- viaFlowId: Flow_09p0qmq
- branchContext: —
- graphNo: 51
- stopReason: —

### R0 #10
- nodeId: `Gateway_1qzyii9`
- title: Какой вид тары?
- lane: Работа сотрудника
- viaFlowId: Flow_1nbfieu
- branchContext: —
- graphNo: 108
- stopReason: —

### R0 #11
- nodeId: `Activity_0w4rqcg`
- title: Открыть крышку
- lane: Работа сотрудника
- viaFlowId: Flow_0permcn
- branchContext: Gateway_1qzyii9 :: С крышкой
- graphNo: 55
- stopReason: —

### R0 #12
- nodeId: `Gateway_1tys43i`
- title: Gateway_1tys43i
- lane: Работа сотрудника
- viaFlowId: Flow_0vfifyv
- branchContext: —
- graphNo: 118
- stopReason: —

### R0 #13
- nodeId: `Activity_177u5au`
- title: Выкинуть плёнку/крышку в мусорный бак
- lane: Работа сотрудника
- viaFlowId: Flow_0209707
- branchContext: —
- graphNo: 54
- stopReason: —

### R0 #14
- nodeId: `Activity_00xx7nl`
- title: Переместить открытый суп к СВЧ печи
- lane: Работа сотрудника
- viaFlowId: Flow_1i5ed5u
- branchContext: —
- graphNo: 69
- stopReason: —

### R0 #15
- nodeId: `Activity_1tghc67`
- title: Открыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_0uos5tk
- branchContext: —
- graphNo: 57
- stopReason: —

### R0 #16
- nodeId: `Activity_1tsk3kf`
- title: Поставить в СВЧ
- lane: Работа с оборудованием
- viaFlowId: Flow_002q8sl
- branchContext: —
- graphNo: 100
- stopReason: —

### R0 #17
- nodeId: `Activity_1jw2q8u`
- title: Закрыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_01z2bfy
- branchContext: —
- graphNo: 101
- stopReason: —

### R0 #18
- nodeId: `Activity_0238wyw`
- title: Установить мощность/ таймер разогрева
- lane: Работа с оборудованием
- viaFlowId: Flow_0bpycud
- branchContext: —
- graphNo: 102
- stopReason: —

### R0 #19
- nodeId: `Activity_07dw2ru`
- title: Запустить СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_1l3471u
- branchContext: —
- graphNo: 103
- stopReason: —

### R0 #20
- nodeId: `Gateway_1yytlts`
- title: Параллельный процесс
- lane: Работа с оборудованием
- viaFlowId: Flow_0qbk0qe
- branchContext: —
- graphNo: 122
- stopReason: —

### R0 #21
- nodeId: `Activity_1gmqktc`
- title: Открыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_1clboby
- branchContext: Gateway_1yytlts :: (без label)
- graphNo: 58
- stopReason: —

### R0 #22
- nodeId: `Activity_1sne2zz`
- title: Взять разогретый суп (достать из СВЧ)
- lane: Работа сотрудника
- viaFlowId: Flow_0gsexs8
- branchContext: —
- graphNo: 61
- stopReason: —

### R0 #23
- nodeId: `Gateway_1ga44yx`
- title: Проверка перед взятием. Есть явная протечка/деформация тары?
- lane: Работа сотрудника
- viaFlowId: Flow_02bvvns
- branchContext: —
- graphNo: 109
- stopReason: —

### R0 #24
- nodeId: `Activity_1273na5`
- title: Перенести в зону сборки
- lane: Работа сотрудника
- viaFlowId: Flow_0nug5zp
- branchContext: Gateway_1ga44yx :: Нет
- graphNo: 64
- stopReason: —

### R0 #25
- nodeId: `Activity_0flva8y`
- title: Закрыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_036ylsh
- branchContext: —
- graphNo: 65
- stopReason: —

### R0 #26
- nodeId: `Activity_03ibxr5`
- title: Убедиться в температуре выше 75С*
- lane: Работа сотрудника
- viaFlowId: Flow_0kd4icx
- branchContext: —
- graphNo: 66
- stopReason: —

### R0 #27
- nodeId: `Gateway_03ygf9x`
- title: Есть пар,
Пятнышки масла на поверхности , отсутствие льдышки
- lane: Работа сотрудника
- viaFlowId: Flow_0673ko3
- branchContext: —
- graphNo: 112
- stopReason: —

### R0 #28
- nodeId: `Activity_0nrtdbw`
- title: Взять термощуп и измерить температуру в центре супа
- lane: Работа сотрудника
- viaFlowId: Flow_0i8zyee
- branchContext: Gateway_03ygf9x :: Да
- graphNo: 105
- stopReason: —

### R0 #29
- nodeId: `Gateway_1w0fah0`
- title: Температура выше 75 градусов?
- lane: Работа сотрудника
- viaFlowId: Flow_1n8vuer
- branchContext: —
- graphNo: 113
- stopReason: —

### R0 #30
- nodeId: `Activity_1nmuo3d`
- title: Взять разогретый суп (горячую тару для перелива)
- lane: Работа сотрудника
- viaFlowId: Flow_0ccm7n7
- branchContext: Gateway_1w0fah0 :: Да
- graphNo: 70
- stopReason: —

### R0 #31
- nodeId: `Activity_1ob89db`
- title: Перенести суп над контейнером для покупателя
- lane: Работа сотрудника
- viaFlowId: Flow_0coo0b3
- branchContext: —
- graphNo: 72
- stopReason: —

### R0 #32
- nodeId: `Activity_171znbt`
- title: Перелить суп в контейнер для покупателя
- lane: Работа сотрудника
- viaFlowId: Flow_0psw6u7
- branchContext: —
- graphNo: 71
- stopReason: —

### R0 #33
- nodeId: `Activity_0uewbw6`
- title: Взять крышку от контейнера
- lane: Работа сотрудника
- viaFlowId: Flow_1rfanib
- branchContext: —
- graphNo: 76
- stopReason: —

### R0 #34
- nodeId: `Activity_1croc09`
- title: Укупорить суп
- lane: Работа сотрудника
- viaFlowId: Flow_19kakgx
- branchContext: —
- graphNo: 75
- stopReason: —

### R0 #35
- nodeId: `Activity_0nux093`
- title: Убедится , что суп плотно закрыт
- lane: Работа сотрудника
- viaFlowId: Flow_01onqsx
- branchContext: —
- graphNo: 74
- stopReason: —

### R0 #36
- nodeId: `Activity_0th269d`
- title: Взять старую тару (в которой разогревался суп)
- lane: Работа сотрудника
- viaFlowId: Flow_1p5bvvq
- branchContext: —
- graphNo: 73
- stopReason: —

### R0 #37
- nodeId: `Activity_1qejxgi`
- title: Подойти к мусорке
- lane: Работа сотрудника
- viaFlowId: Flow_0ozf2dx
- branchContext: —
- graphNo: 77
- stopReason: —

### R0 #38
- nodeId: `Activity_0ew2wl3`
- title: Нажать педали мусорки
- lane: Работа сотрудника
- viaFlowId: Flow_17nfywd
- branchContext: —
- graphNo: 78
- stopReason: —

### R0 #39
- nodeId: `Gateway_1idc4ex`
- title: Мусорка переполнена ?
- lane: Работа сотрудника
- viaFlowId: Flow_0yo37n6
- branchContext: —
- graphNo: 114
- stopReason: —

### R0 #40
- nodeId: `Activity_10pdewi`
- title: Выбросить тару в мусорку
- lane: Работа сотрудника
- viaFlowId: Flow_1uz1iaf
- branchContext: Gateway_1idc4ex :: Нет
- graphNo: 79
- stopReason: —

### R0 #41
- nodeId: `Activity_0697vcq`
- title: подойти к компьютеру
- lane: Работа сотрудника
- viaFlowId: Flow_0x3uer0
- branchContext: —
- graphNo: 86
- stopReason: —

### R0 #42
- nodeId: `Activity_1gwr8or`
- title: нажать печать этикетки
- lane: Работа программы сборки
- viaFlowId: Flow_07bbkam
- branchContext: —
- graphNo: 87
- stopReason: —

### R0 #43
- nodeId: `Activity_1u7tw5g`
- title: Термопринтер печатает этикетку
- lane: Работа с оборудованием
- viaFlowId: Flow_1kgklrw
- branchContext: —
- graphNo: 89
- stopReason: —

### R0 #44
- nodeId: `Activity_0mdfih5`
- title: Забрать этикетку
- lane: Работа сотрудника
- viaFlowId: Flow_060vdo7
- branchContext: —
- graphNo: 88
- stopReason: —

### R0 #45
- nodeId: `Activity_0ksn5ed`
- title: Наклеить этикетку на крышку банки с супом
- lane: Работа сотрудника
- viaFlowId: Flow_04ui7gq
- branchContext: —
- graphNo: 81
- stopReason: —

### R0 #46
- nodeId: `Activity_1019azk`
- title: Взять фольгированный пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0juhkmb
- branchContext: —
- graphNo: 82
- stopReason: —

### R0 #47
- nodeId: `Activity_12z3j99`
- title: Открыть пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0arviz6
- branchContext: —
- graphNo: 83
- stopReason: —

### R0 #48
- nodeId: `Activity_1kp4c93`
- title: Взять суп
- lane: Работа сотрудника
- viaFlowId: Flow_02iprom
- branchContext: —
- graphNo: 84
- stopReason: —

### R0 #49
- nodeId: `Activity_0ppebcj`
- title: Вложить суп в пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0f8zrme
- branchContext: —
- graphNo: 85
- stopReason: —

### R0 #50
- nodeId: `Gateway_13frvr2`
- title: Нужны топпинги?
- lane: Работа сотрудника
- viaFlowId: Flow_05uk8kz
- branchContext: —
- graphNo: 115
- stopReason: —

### R0 #51
- nodeId: `Gateway_1kdlvf8`
- title: Нужны приборы?
- lane: Работа сотрудника
- viaFlowId: Flow_1pc3ucn
- branchContext: Gateway_13frvr2 :: Нет
- graphNo: 116
- stopReason: —

### R0 #52
- nodeId: `Activity_0hw9udd`
- title: Закрыть пакет
- lane: Работа сотрудника
- viaFlowId: Flow_175fc18
- branchContext: Gateway_1kdlvf8 :: Нет
- graphNo: 99
- stopReason: —

### R0 #53
- nodeId: `Activity_0adbnrz`
- title: Распечатать этикетку курьеру
- lane: Работа программы сборки
- viaFlowId: Flow_1lmi10n
- branchContext: —
- graphNo: 91
- stopReason: —

### R0 #54
- nodeId: `Activity_0mzydsr`
- title: Наклеить этикетку на пакет
- lane: Работа сотрудника
- viaFlowId: Flow_1qyipl7
- branchContext: —
- graphNo: 90
- stopReason: —

### R0 #55
- nodeId: `Activity_0i0it93`
- title: Открыть тепловой шкаф
- lane: Работа с оборудованием
- viaFlowId: Flow_01k4laz
- branchContext: —
- graphNo: 92
- stopReason: —

### R0 #56
- nodeId: `Activity_1r77ain`
- title: Поставить пакет в тепловой шкаф
- lane: Работа сотрудника
- viaFlowId: Flow_1ub7gwa
- branchContext: —
- graphNo: 93
- stopReason: —

### R0 #57
- nodeId: `Activity_1d89hw2`
- title: Закрыть тепловой шкаф
- lane: Работа с оборудованием
- viaFlowId: Flow_02du2dp
- branchContext: —
- graphNo: 107
- stopReason: —

### R0 #58
- nodeId: `Activity_1ixcfjj`
- title: Нажать “заказ готов”
- lane: Работа программы сборки
- viaFlowId: Flow_0pru7c3
- branchContext: —
- graphNo: 106
- stopReason: —

### R0 #59
- nodeId: `Activity_00t6ixs`
- title: Мойка поверхностей
- lane: Работа сотрудника
- viaFlowId: Flow_1cz5s63
- branchContext: —
- graphNo: 97
- stopReason: —

### R0 #60
- nodeId: `Event_1pqduoq`
- title: Процесс завершён
- lane: Работа сотрудника
- viaFlowId: Flow_1ndeuot
- branchContext: —
- graphNo: 125
- stopReason: end

| # | Откуда (node) | Flow | Условие | Шаг (node) | Flow | Куда (node) | R-tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | — | — | — | Event_05ckyt4 | Flow_1f9se1h | Event_0n3sbnt | R0 |
| 2 | Event_05ckyt4 | Flow_1f9se1h | — | Event_0n3sbnt | Flow_1opvtxu | Activity_01pgxk6 | R0 |
| 3 | Event_0n3sbnt | Flow_1opvtxu | — | Activity_01pgxk6 | Flow_00ntdu7 | Activity_0m37490 | R0 |
| 4 | Activity_01pgxk6 | Flow_00ntdu7 | — | Activity_0m37490 | Flow_0uo9mwm | Activity_17t320o | R0 |
| 5 | Activity_0m37490 | Flow_0uo9mwm | — | Activity_17t320o | Flow_194a7it | Gateway_0d27wqt | R0 |
| 6 | Activity_17t320o | Flow_194a7it | 2 секунды | Gateway_0d27wqt | Flow_168fa3r | Gateway_0vjlz9j | R0 |
| 7 | Gateway_0d27wqt | Flow_168fa3r | Да | Gateway_0vjlz9j | Flow_1ths047 | Activity_1k9t4a7 | R0 |
| 8 | Gateway_0vjlz9j | Flow_1ths047 | — | Activity_1k9t4a7 | Flow_09p0qmq | Activity_1udbo2p | R0 |
| 9 | Activity_1k9t4a7 | Flow_09p0qmq | — | Activity_1udbo2p | Flow_1nbfieu | Gateway_1qzyii9 | R0 |
| 10 | Activity_1udbo2p | Flow_1nbfieu | — | Gateway_1qzyii9 | Flow_0permcn | Activity_0w4rqcg | R0 |
| 11 | Gateway_1qzyii9 | Flow_0permcn | С крышкой | Activity_0w4rqcg | Flow_0vfifyv | Gateway_1tys43i | R0 |
| 12 | Activity_0w4rqcg | Flow_0vfifyv | — | Gateway_1tys43i | Flow_0209707 | Activity_177u5au | R0 |
| 13 | Gateway_1tys43i | Flow_0209707 | — | Activity_177u5au | Flow_1i5ed5u | Activity_00xx7nl | R0 |
| 14 | Activity_177u5au | Flow_1i5ed5u | — | Activity_00xx7nl | Flow_0uos5tk | Activity_1tghc67 | R0 |
| 15 | Activity_00xx7nl | Flow_0uos5tk | тара поставлена в точку у СВЧ/перед СВЧ | Activity_1tghc67 | Flow_002q8sl | Activity_1tsk3kf | R0 |
| 16 | Activity_1tghc67 | Flow_002q8sl | — | Activity_1tsk3kf | Flow_01z2bfy | Activity_1jw2q8u | R0 |
| 17 | Activity_1tsk3kf | Flow_01z2bfy | — | Activity_1jw2q8u | Flow_0bpycud | Activity_0238wyw | R0 |
| 18 | Activity_1jw2q8u | Flow_0bpycud | дверь закрыта, “щелчок/замок”, печь готова стартовать. | Activity_0238wyw | Flow_1l3471u | Activity_07dw2ru | R0 |
| 19 | Activity_0238wyw | Flow_1l3471u | — | Activity_07dw2ru | Flow_0qbk0qe | Gateway_1yytlts | R0 |
| 20 | Activity_07dw2ru | Flow_0qbk0qe | — | Gateway_1yytlts | Flow_1clboby | Activity_1gmqktc | R0 |
| 21 | Gateway_1yytlts | Flow_1clboby | — | Activity_1gmqktc | Flow_0gsexs8 | Activity_1sne2zz | R0 |
| 22 | Activity_1gmqktc | Flow_0gsexs8 | — | Activity_1sne2zz | Flow_02bvvns | Gateway_1ga44yx | R0 |
| 23 | Activity_1sne2zz | Flow_02bvvns | — | Gateway_1ga44yx | Flow_0nug5zp | Activity_1273na5 | R0 |
| 24 | Gateway_1ga44yx | Flow_0nug5zp | Нет | Activity_1273na5 | Flow_036ylsh | Activity_0flva8y | R0 |
| 25 | Activity_1273na5 | Flow_036ylsh | — | Activity_0flva8y | Flow_0kd4icx | Activity_03ibxr5 | R0 |
| 26 | Activity_0flva8y | Flow_0kd4icx | закрылось | Activity_03ibxr5 | Flow_0673ko3 | Gateway_03ygf9x | R0 |
| 27 | Activity_03ibxr5 | Flow_0673ko3 | — | Gateway_03ygf9x | Flow_0i8zyee | Activity_0nrtdbw | R0 |
| 28 | Gateway_03ygf9x | Flow_0i8zyee | Да | Activity_0nrtdbw | Flow_1n8vuer | Gateway_1w0fah0 | R0 |
| 29 | Activity_0nrtdbw | Flow_1n8vuer | — | Gateway_1w0fah0 | Flow_0ccm7n7 | Activity_1nmuo3d | R0 |
| 30 | Gateway_1w0fah0 | Flow_0ccm7n7 | Да | Activity_1nmuo3d | Flow_0coo0b3 | Activity_1ob89db | R0 |
| 31 | Activity_1nmuo3d | Flow_0coo0b3 | — | Activity_1ob89db | Flow_0psw6u7 | Activity_171znbt | R0 |
| 32 | Activity_1ob89db | Flow_0psw6u7 | Суп не пролился при переносе | Activity_171znbt | Flow_1rfanib | Activity_0uewbw6 | R0 |
| 33 | Activity_171znbt | Flow_1rfanib | суп перелит, визуально нет пролива вне контейнера | Activity_0uewbw6 | Flow_19kakgx | Activity_1croc09 | R0 |
| 34 | Activity_0uewbw6 | Flow_19kakgx | крышка в руках, ориентирована под закрытие. | Activity_1croc09 | Flow_01onqsx | Activity_0nux093 | R0 |
| 35 | Activity_1croc09 | Flow_01onqsx | закрытие = щелчок + визуальный контроль (если перекос - видно) | Activity_0nux093 | Flow_1p5bvvq | Activity_0th269d | R0 |
| 36 | Activity_0nux093 | Flow_1p5bvvq | при наклоне (с удержанием крышки) нет подтеков, визуально крышка сидит ровно. | Activity_0th269d | Flow_0ozf2dx | Activity_1qejxgi | R0 |
| 37 | Activity_0th269d | Flow_0ozf2dx | — | Activity_1qejxgi | Flow_17nfywd | Activity_0ew2wl3 | R0 |
| 38 | Activity_1qejxgi | Flow_17nfywd | — | Activity_0ew2wl3 | Flow_0yo37n6 | Gateway_1idc4ex | R0 |
| 39 | Activity_0ew2wl3 | Flow_0yo37n6 | — | Gateway_1idc4ex | Flow_1uz1iaf | Activity_10pdewi | R0 |
| 40 | Gateway_1idc4ex | Flow_1uz1iaf | Нет | Activity_10pdewi | Flow_0x3uer0 | Activity_0697vcq | R0 |
| 41 | Activity_10pdewi | Flow_0x3uer0 | — | Activity_0697vcq | Flow_07bbkam | Activity_1gwr8or | R0 |
| 42 | Activity_0697vcq | Flow_07bbkam | — | Activity_1gwr8or | Flow_1kgklrw | Activity_1u7tw5g | R0 |
| 43 | Activity_1gwr8or | Flow_1kgklrw | — | Activity_1u7tw5g | Flow_060vdo7 | Activity_0mdfih5 | R0 |
| 44 | Activity_1u7tw5g | Flow_060vdo7 | этикетка напечатана читабельно | Activity_0mdfih5 | Flow_04ui7gq | Activity_0ksn5ed | R0 |
| 45 | Activity_0mdfih5 | Flow_04ui7gq | — | Activity_0ksn5ed | Flow_0juhkmb | Activity_1019azk | R0 |
| 46 | Activity_0ksn5ed | Flow_0juhkmb | наклеена корректно | Activity_1019azk | Flow_0arviz6 | Activity_12z3j99 | R0 |
| 47 | Activity_1019azk | Flow_0arviz6 | — | Activity_12z3j99 | Flow_02iprom | Activity_1kp4c93 | R0 |
| 48 | Activity_12z3j99 | Flow_02iprom | — | Activity_1kp4c93 | Flow_0f8zrme | Activity_0ppebcj | R0 |
| 49 | Activity_1kp4c93 | Flow_0f8zrme | пакет целый, без прокола | Activity_0ppebcj | Flow_05uk8kz | Gateway_13frvr2 | R0 |
| 50 | Activity_0ppebcj | Flow_05uk8kz | — | Gateway_13frvr2 | Flow_1pc3ucn | Gateway_1kdlvf8 | R0 |
| 51 | Gateway_13frvr2 | Flow_1pc3ucn | Нет | Gateway_1kdlvf8 | Flow_175fc18 | Activity_0hw9udd | R0 |
| 52 | Gateway_1kdlvf8 | Flow_175fc18 | Нет | Activity_0hw9udd | Flow_1lmi10n | Activity_0adbnrz | R0 |
| 53 | Activity_0hw9udd | Flow_1lmi10n | — | Activity_0adbnrz | Flow_1qyipl7 | Activity_0mzydsr | R0 |
| 54 | Activity_0adbnrz | Flow_1qyipl7 | — | Activity_0mzydsr | Flow_01k4laz | Activity_0i0it93 | R0 |
| 55 | Activity_0mzydsr | Flow_01k4laz | — | Activity_0i0it93 | Flow_1ub7gwa | Activity_1r77ain | R0 |
| 56 | Activity_0i0it93 | Flow_1ub7gwa | — | Activity_1r77ain | Flow_02du2dp | Activity_1d89hw2 | R0 |
| 57 | Activity_1r77ain | Flow_02du2dp | — | Activity_1d89hw2 | Flow_0pru7c3 | Activity_1ixcfjj | R0 |
| 58 | Activity_1d89hw2 | Flow_0pru7c3 | заказ размещён в правильной ячейке/полке, дверца закрыта. | Activity_1ixcfjj | Flow_1cz5s63 | Activity_00t6ixs | R0 |
| 59 | Activity_1ixcfjj | Flow_1cz5s63 | — | Activity_00t6ixs | Flow_1ndeuot | Event_1pqduoq | R0 |
| 60 | Activity_00t6ixs | Flow_1ndeuot | — | Event_1pqduoq | — | — | R0 |

## R1 Trace
### R1 #1
- nodeId: `Event_05ckyt4`
- title: Заказ на суп
- lane: Работа сотрудника
- viaFlowId: —
- branchContext: —
- graphNo: 1
- stopReason: —

### R1 #2
- nodeId: `Event_0n3sbnt`
- title: Звуковой сигнал о новом заказе
- lane: Работа сотрудника
- viaFlowId: Flow_1f9se1h
- branchContext: —
- graphNo: 43
- stopReason: —

### R1 #3
- nodeId: `Activity_01pgxk6`
- title: Сотрудник подходит к компьютеру
- lane: Работа сотрудника
- viaFlowId: Flow_1opvtxu
- branchContext: —
- graphNo: 44
- stopReason: —

### R1 #4
- nodeId: `Activity_0m37490`
- title: Посмотреть состав заказа в ВВ партнер
- lane: Работа программы сборки
- viaFlowId: Flow_00ntdu7
- branchContext: —
- graphNo: 45
- stopReason: —

### R1 #5
- nodeId: `Activity_17t320o`
- title: Нажать кнопку "Начать сборку"
- lane: Работа программы сборки
- viaFlowId: Flow_0uo9mwm
- branchContext: —
- graphNo: 46
- stopReason: —

### R1 #6
- nodeId: `Gateway_0d27wqt`
- title: Появилась кнопка "передать в доставку"?
- lane: Работа программы сборки
- viaFlowId: Flow_194a7it
- branchContext: —
- graphNo: 47
- stopReason: —

### R1 #7
- nodeId: `Activity_1fbaouj`
- title: Нажать повторно кнопку "Начать сборку"
- lane: Работа программы сборки
- viaFlowId: Flow_1einwy2
- branchContext: Gateway_0d27wqt :: Нет
- graphNo: 62
- stopReason: —

### R1 #8
- nodeId: `Gateway_0yfbohy`
- title: Появилась кнопка "передать в доставку"?
- lane: Работа программы сборки
- viaFlowId: Flow_0c3fhuz
- branchContext: —
- graphNo: 110
- stopReason: —

### R1 #9
- nodeId: `Gateway_0vjlz9j`
- title: Gateway_0vjlz9j
- lane: Работа с оборудованием
- viaFlowId: Flow_1qethxe
- branchContext: Gateway_0yfbohy :: Да
- graphNo: 117
- stopReason: —

### R1 #10
- nodeId: `Activity_1k9t4a7`
- title: Открыть холодильник заморозки
- lane: Работа с оборудованием
- viaFlowId: Flow_1ths047
- branchContext: —
- graphNo: 50
- stopReason: —

### R1 #11
- nodeId: `Activity_1udbo2p`
- title: Взять необходимый суп с полки
- lane: Работа сотрудника
- viaFlowId: Flow_09p0qmq
- branchContext: —
- graphNo: 51
- stopReason: —

### R1 #12
- nodeId: `Gateway_1qzyii9`
- title: Какой вид тары?
- lane: Работа сотрудника
- viaFlowId: Flow_1nbfieu
- branchContext: —
- graphNo: 108
- stopReason: —

### R1 #13
- nodeId: `Activity_0w4rqcg`
- title: Открыть крышку
- lane: Работа сотрудника
- viaFlowId: Flow_0permcn
- branchContext: Gateway_1qzyii9 :: С крышкой
- graphNo: 55
- stopReason: —

### R1 #14
- nodeId: `Gateway_1tys43i`
- title: Gateway_1tys43i
- lane: Работа сотрудника
- viaFlowId: Flow_0vfifyv
- branchContext: —
- graphNo: 118
- stopReason: —

### R1 #15
- nodeId: `Activity_177u5au`
- title: Выкинуть плёнку/крышку в мусорный бак
- lane: Работа сотрудника
- viaFlowId: Flow_0209707
- branchContext: —
- graphNo: 54
- stopReason: —

### R1 #16
- nodeId: `Activity_00xx7nl`
- title: Переместить открытый суп к СВЧ печи
- lane: Работа сотрудника
- viaFlowId: Flow_1i5ed5u
- branchContext: —
- graphNo: 69
- stopReason: —

### R1 #17
- nodeId: `Activity_1tghc67`
- title: Открыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_0uos5tk
- branchContext: —
- graphNo: 57
- stopReason: —

### R1 #18
- nodeId: `Activity_1tsk3kf`
- title: Поставить в СВЧ
- lane: Работа с оборудованием
- viaFlowId: Flow_002q8sl
- branchContext: —
- graphNo: 100
- stopReason: —

### R1 #19
- nodeId: `Activity_1jw2q8u`
- title: Закрыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_01z2bfy
- branchContext: —
- graphNo: 101
- stopReason: —

### R1 #20
- nodeId: `Activity_0238wyw`
- title: Установить мощность/ таймер разогрева
- lane: Работа с оборудованием
- viaFlowId: Flow_0bpycud
- branchContext: —
- graphNo: 102
- stopReason: —

### R1 #21
- nodeId: `Activity_07dw2ru`
- title: Запустить СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_1l3471u
- branchContext: —
- graphNo: 103
- stopReason: —

### R1 #22
- nodeId: `Gateway_1yytlts`
- title: Параллельный процесс
- lane: Работа с оборудованием
- viaFlowId: Flow_0qbk0qe
- branchContext: —
- graphNo: 122
- stopReason: —

### R1 #23
- nodeId: `Activity_1gmqktc`
- title: Открыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_1clboby
- branchContext: Gateway_1yytlts :: (без label)
- graphNo: 58
- stopReason: —

### R1 #24
- nodeId: `Activity_1sne2zz`
- title: Взять разогретый суп (достать из СВЧ)
- lane: Работа сотрудника
- viaFlowId: Flow_0gsexs8
- branchContext: —
- graphNo: 61
- stopReason: —

### R1 #25
- nodeId: `Gateway_1ga44yx`
- title: Проверка перед взятием. Есть явная протечка/деформация тары?
- lane: Работа сотрудника
- viaFlowId: Flow_02bvvns
- branchContext: —
- graphNo: 109
- stopReason: —

### R1 #26
- nodeId: `Activity_1273na5`
- title: Перенести в зону сборки
- lane: Работа сотрудника
- viaFlowId: Flow_0nug5zp
- branchContext: Gateway_1ga44yx :: Нет
- graphNo: 64
- stopReason: —

### R1 #27
- nodeId: `Activity_0flva8y`
- title: Закрыть СВЧ печь
- lane: Работа с оборудованием
- viaFlowId: Flow_036ylsh
- branchContext: —
- graphNo: 65
- stopReason: —

### R1 #28
- nodeId: `Activity_03ibxr5`
- title: Убедиться в температуре выше 75С*
- lane: Работа сотрудника
- viaFlowId: Flow_0kd4icx
- branchContext: —
- graphNo: 66
- stopReason: —

### R1 #29
- nodeId: `Gateway_03ygf9x`
- title: Есть пар,
Пятнышки масла на поверхности , отсутствие льдышки
- lane: Работа сотрудника
- viaFlowId: Flow_0673ko3
- branchContext: —
- graphNo: 112
- stopReason: —

### R1 #30
- nodeId: `Activity_0nrtdbw`
- title: Взять термощуп и измерить температуру в центре супа
- lane: Работа сотрудника
- viaFlowId: Flow_0i8zyee
- branchContext: Gateway_03ygf9x :: Да
- graphNo: 105
- stopReason: —

### R1 #31
- nodeId: `Gateway_1w0fah0`
- title: Температура выше 75 градусов?
- lane: Работа сотрудника
- viaFlowId: Flow_1n8vuer
- branchContext: —
- graphNo: 113
- stopReason: —

### R1 #32
- nodeId: `Activity_1nmuo3d`
- title: Взять разогретый суп (горячую тару для перелива)
- lane: Работа сотрудника
- viaFlowId: Flow_0ccm7n7
- branchContext: Gateway_1w0fah0 :: Да
- graphNo: 70
- stopReason: —

### R1 #33
- nodeId: `Activity_1ob89db`
- title: Перенести суп над контейнером для покупателя
- lane: Работа сотрудника
- viaFlowId: Flow_0coo0b3
- branchContext: —
- graphNo: 72
- stopReason: —

### R1 #34
- nodeId: `Activity_171znbt`
- title: Перелить суп в контейнер для покупателя
- lane: Работа сотрудника
- viaFlowId: Flow_0psw6u7
- branchContext: —
- graphNo: 71
- stopReason: —

### R1 #35
- nodeId: `Activity_0uewbw6`
- title: Взять крышку от контейнера
- lane: Работа сотрудника
- viaFlowId: Flow_1rfanib
- branchContext: —
- graphNo: 76
- stopReason: —

### R1 #36
- nodeId: `Activity_1croc09`
- title: Укупорить суп
- lane: Работа сотрудника
- viaFlowId: Flow_19kakgx
- branchContext: —
- graphNo: 75
- stopReason: —

### R1 #37
- nodeId: `Activity_0nux093`
- title: Убедится , что суп плотно закрыт
- lane: Работа сотрудника
- viaFlowId: Flow_01onqsx
- branchContext: —
- graphNo: 74
- stopReason: —

### R1 #38
- nodeId: `Activity_0th269d`
- title: Взять старую тару (в которой разогревался суп)
- lane: Работа сотрудника
- viaFlowId: Flow_1p5bvvq
- branchContext: —
- graphNo: 73
- stopReason: —

### R1 #39
- nodeId: `Activity_1qejxgi`
- title: Подойти к мусорке
- lane: Работа сотрудника
- viaFlowId: Flow_0ozf2dx
- branchContext: —
- graphNo: 77
- stopReason: —

### R1 #40
- nodeId: `Activity_0ew2wl3`
- title: Нажать педали мусорки
- lane: Работа сотрудника
- viaFlowId: Flow_17nfywd
- branchContext: —
- graphNo: 78
- stopReason: —

### R1 #41
- nodeId: `Gateway_1idc4ex`
- title: Мусорка переполнена ?
- lane: Работа сотрудника
- viaFlowId: Flow_0yo37n6
- branchContext: —
- graphNo: 114
- stopReason: —

### R1 #42
- nodeId: `Activity_10pdewi`
- title: Выбросить тару в мусорку
- lane: Работа сотрудника
- viaFlowId: Flow_1uz1iaf
- branchContext: Gateway_1idc4ex :: Нет
- graphNo: 79
- stopReason: —

### R1 #43
- nodeId: `Activity_0697vcq`
- title: подойти к компьютеру
- lane: Работа сотрудника
- viaFlowId: Flow_0x3uer0
- branchContext: —
- graphNo: 86
- stopReason: —

### R1 #44
- nodeId: `Activity_1gwr8or`
- title: нажать печать этикетки
- lane: Работа программы сборки
- viaFlowId: Flow_07bbkam
- branchContext: —
- graphNo: 87
- stopReason: —

### R1 #45
- nodeId: `Activity_1u7tw5g`
- title: Термопринтер печатает этикетку
- lane: Работа с оборудованием
- viaFlowId: Flow_1kgklrw
- branchContext: —
- graphNo: 89
- stopReason: —

### R1 #46
- nodeId: `Activity_0mdfih5`
- title: Забрать этикетку
- lane: Работа сотрудника
- viaFlowId: Flow_060vdo7
- branchContext: —
- graphNo: 88
- stopReason: —

### R1 #47
- nodeId: `Activity_0ksn5ed`
- title: Наклеить этикетку на крышку банки с супом
- lane: Работа сотрудника
- viaFlowId: Flow_04ui7gq
- branchContext: —
- graphNo: 81
- stopReason: —

### R1 #48
- nodeId: `Activity_1019azk`
- title: Взять фольгированный пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0juhkmb
- branchContext: —
- graphNo: 82
- stopReason: —

### R1 #49
- nodeId: `Activity_12z3j99`
- title: Открыть пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0arviz6
- branchContext: —
- graphNo: 83
- stopReason: —

### R1 #50
- nodeId: `Activity_1kp4c93`
- title: Взять суп
- lane: Работа сотрудника
- viaFlowId: Flow_02iprom
- branchContext: —
- graphNo: 84
- stopReason: —

### R1 #51
- nodeId: `Activity_0ppebcj`
- title: Вложить суп в пакет
- lane: Работа сотрудника
- viaFlowId: Flow_0f8zrme
- branchContext: —
- graphNo: 85
- stopReason: —

### R1 #52
- nodeId: `Gateway_13frvr2`
- title: Нужны топпинги?
- lane: Работа сотрудника
- viaFlowId: Flow_05uk8kz
- branchContext: —
- graphNo: 115
- stopReason: —

### R1 #53
- nodeId: `Gateway_1kdlvf8`
- title: Нужны приборы?
- lane: Работа сотрудника
- viaFlowId: Flow_1pc3ucn
- branchContext: Gateway_13frvr2 :: Нет
- graphNo: 116
- stopReason: —

### R1 #54
- nodeId: `Activity_0hw9udd`
- title: Закрыть пакет
- lane: Работа сотрудника
- viaFlowId: Flow_175fc18
- branchContext: Gateway_1kdlvf8 :: Нет
- graphNo: 99
- stopReason: —

### R1 #55
- nodeId: `Activity_0adbnrz`
- title: Распечатать этикетку курьеру
- lane: Работа программы сборки
- viaFlowId: Flow_1lmi10n
- branchContext: —
- graphNo: 91
- stopReason: —

### R1 #56
- nodeId: `Activity_0mzydsr`
- title: Наклеить этикетку на пакет
- lane: Работа сотрудника
- viaFlowId: Flow_1qyipl7
- branchContext: —
- graphNo: 90
- stopReason: —

### R1 #57
- nodeId: `Activity_0i0it93`
- title: Открыть тепловой шкаф
- lane: Работа с оборудованием
- viaFlowId: Flow_01k4laz
- branchContext: —
- graphNo: 92
- stopReason: —

### R1 #58
- nodeId: `Activity_1r77ain`
- title: Поставить пакет в тепловой шкаф
- lane: Работа сотрудника
- viaFlowId: Flow_1ub7gwa
- branchContext: —
- graphNo: 93
- stopReason: —

### R1 #59
- nodeId: `Activity_1d89hw2`
- title: Закрыть тепловой шкаф
- lane: Работа с оборудованием
- viaFlowId: Flow_02du2dp
- branchContext: —
- graphNo: 107
- stopReason: —

### R1 #60
- nodeId: `Activity_1ixcfjj`
- title: Нажать “заказ готов”
- lane: Работа программы сборки
- viaFlowId: Flow_0pru7c3
- branchContext: —
- graphNo: 106
- stopReason: —

### R1 #61
- nodeId: `Activity_00t6ixs`
- title: Мойка поверхностей
- lane: Работа сотрудника
- viaFlowId: Flow_1cz5s63
- branchContext: —
- graphNo: 97
- stopReason: —

### R1 #62
- nodeId: `Event_1pqduoq`
- title: Процесс завершён
- lane: Работа сотрудника
- viaFlowId: Flow_1ndeuot
- branchContext: —
- graphNo: 125
- stopReason: end

| # | Откуда (node) | Flow | Условие | Шаг (node) | Flow | Куда (node) | R-tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | — | — | — | Event_05ckyt4 | Flow_1f9se1h | Event_0n3sbnt | R1 |
| 2 | Event_05ckyt4 | Flow_1f9se1h | — | Event_0n3sbnt | Flow_1opvtxu | Activity_01pgxk6 | R1 |
| 3 | Event_0n3sbnt | Flow_1opvtxu | — | Activity_01pgxk6 | Flow_00ntdu7 | Activity_0m37490 | R1 |
| 4 | Activity_01pgxk6 | Flow_00ntdu7 | — | Activity_0m37490 | Flow_0uo9mwm | Activity_17t320o | R1 |
| 5 | Activity_0m37490 | Flow_0uo9mwm | — | Activity_17t320o | Flow_194a7it | Gateway_0d27wqt | R1 |
| 6 | Activity_17t320o | Flow_194a7it | 2 секунды | Gateway_0d27wqt | Flow_1einwy2 | Activity_1fbaouj | R1 |
| 7 | Gateway_0d27wqt | Flow_1einwy2 | Нет | Activity_1fbaouj | Flow_0c3fhuz | Gateway_0yfbohy | R1 |
| 8 | Activity_1fbaouj | Flow_0c3fhuz | — | Gateway_0yfbohy | Flow_1qethxe | Gateway_0vjlz9j | R1 |
| 9 | Gateway_0yfbohy | Flow_1qethxe | Да | Gateway_0vjlz9j | Flow_1ths047 | Activity_1k9t4a7 | R1 |
| 10 | Gateway_0vjlz9j | Flow_1ths047 | — | Activity_1k9t4a7 | Flow_09p0qmq | Activity_1udbo2p | R1 |
| 11 | Activity_1k9t4a7 | Flow_09p0qmq | — | Activity_1udbo2p | Flow_1nbfieu | Gateway_1qzyii9 | R1 |
| 12 | Activity_1udbo2p | Flow_1nbfieu | — | Gateway_1qzyii9 | Flow_0permcn | Activity_0w4rqcg | R1 |
| 13 | Gateway_1qzyii9 | Flow_0permcn | С крышкой | Activity_0w4rqcg | Flow_0vfifyv | Gateway_1tys43i | R1 |
| 14 | Activity_0w4rqcg | Flow_0vfifyv | — | Gateway_1tys43i | Flow_0209707 | Activity_177u5au | R1 |
| 15 | Gateway_1tys43i | Flow_0209707 | — | Activity_177u5au | Flow_1i5ed5u | Activity_00xx7nl | R1 |
| 16 | Activity_177u5au | Flow_1i5ed5u | — | Activity_00xx7nl | Flow_0uos5tk | Activity_1tghc67 | R1 |
| 17 | Activity_00xx7nl | Flow_0uos5tk | тара поставлена в точку у СВЧ/перед СВЧ | Activity_1tghc67 | Flow_002q8sl | Activity_1tsk3kf | R1 |
| 18 | Activity_1tghc67 | Flow_002q8sl | — | Activity_1tsk3kf | Flow_01z2bfy | Activity_1jw2q8u | R1 |
| 19 | Activity_1tsk3kf | Flow_01z2bfy | — | Activity_1jw2q8u | Flow_0bpycud | Activity_0238wyw | R1 |
| 20 | Activity_1jw2q8u | Flow_0bpycud | дверь закрыта, “щелчок/замок”, печь готова стартовать. | Activity_0238wyw | Flow_1l3471u | Activity_07dw2ru | R1 |
| 21 | Activity_0238wyw | Flow_1l3471u | — | Activity_07dw2ru | Flow_0qbk0qe | Gateway_1yytlts | R1 |
| 22 | Activity_07dw2ru | Flow_0qbk0qe | — | Gateway_1yytlts | Flow_1clboby | Activity_1gmqktc | R1 |
| 23 | Gateway_1yytlts | Flow_1clboby | — | Activity_1gmqktc | Flow_0gsexs8 | Activity_1sne2zz | R1 |
| 24 | Activity_1gmqktc | Flow_0gsexs8 | — | Activity_1sne2zz | Flow_02bvvns | Gateway_1ga44yx | R1 |
| 25 | Activity_1sne2zz | Flow_02bvvns | — | Gateway_1ga44yx | Flow_0nug5zp | Activity_1273na5 | R1 |
| 26 | Gateway_1ga44yx | Flow_0nug5zp | Нет | Activity_1273na5 | Flow_036ylsh | Activity_0flva8y | R1 |
| 27 | Activity_1273na5 | Flow_036ylsh | — | Activity_0flva8y | Flow_0kd4icx | Activity_03ibxr5 | R1 |
| 28 | Activity_0flva8y | Flow_0kd4icx | закрылось | Activity_03ibxr5 | Flow_0673ko3 | Gateway_03ygf9x | R1 |
| 29 | Activity_03ibxr5 | Flow_0673ko3 | — | Gateway_03ygf9x | Flow_0i8zyee | Activity_0nrtdbw | R1 |
| 30 | Gateway_03ygf9x | Flow_0i8zyee | Да | Activity_0nrtdbw | Flow_1n8vuer | Gateway_1w0fah0 | R1 |
| 31 | Activity_0nrtdbw | Flow_1n8vuer | — | Gateway_1w0fah0 | Flow_0ccm7n7 | Activity_1nmuo3d | R1 |
| 32 | Gateway_1w0fah0 | Flow_0ccm7n7 | Да | Activity_1nmuo3d | Flow_0coo0b3 | Activity_1ob89db | R1 |
| 33 | Activity_1nmuo3d | Flow_0coo0b3 | — | Activity_1ob89db | Flow_0psw6u7 | Activity_171znbt | R1 |
| 34 | Activity_1ob89db | Flow_0psw6u7 | Суп не пролился при переносе | Activity_171znbt | Flow_1rfanib | Activity_0uewbw6 | R1 |
| 35 | Activity_171znbt | Flow_1rfanib | суп перелит, визуально нет пролива вне контейнера | Activity_0uewbw6 | Flow_19kakgx | Activity_1croc09 | R1 |
| 36 | Activity_0uewbw6 | Flow_19kakgx | крышка в руках, ориентирована под закрытие. | Activity_1croc09 | Flow_01onqsx | Activity_0nux093 | R1 |
| 37 | Activity_1croc09 | Flow_01onqsx | закрытие = щелчок + визуальный контроль (если перекос - видно) | Activity_0nux093 | Flow_1p5bvvq | Activity_0th269d | R1 |
| 38 | Activity_0nux093 | Flow_1p5bvvq | при наклоне (с удержанием крышки) нет подтеков, визуально крышка сидит ровно. | Activity_0th269d | Flow_0ozf2dx | Activity_1qejxgi | R1 |
| 39 | Activity_0th269d | Flow_0ozf2dx | — | Activity_1qejxgi | Flow_17nfywd | Activity_0ew2wl3 | R1 |
| 40 | Activity_1qejxgi | Flow_17nfywd | — | Activity_0ew2wl3 | Flow_0yo37n6 | Gateway_1idc4ex | R1 |
| 41 | Activity_0ew2wl3 | Flow_0yo37n6 | — | Gateway_1idc4ex | Flow_1uz1iaf | Activity_10pdewi | R1 |
| 42 | Gateway_1idc4ex | Flow_1uz1iaf | Нет | Activity_10pdewi | Flow_0x3uer0 | Activity_0697vcq | R1 |
| 43 | Activity_10pdewi | Flow_0x3uer0 | — | Activity_0697vcq | Flow_07bbkam | Activity_1gwr8or | R1 |
| 44 | Activity_0697vcq | Flow_07bbkam | — | Activity_1gwr8or | Flow_1kgklrw | Activity_1u7tw5g | R1 |
| 45 | Activity_1gwr8or | Flow_1kgklrw | — | Activity_1u7tw5g | Flow_060vdo7 | Activity_0mdfih5 | R1 |
| 46 | Activity_1u7tw5g | Flow_060vdo7 | этикетка напечатана читабельно | Activity_0mdfih5 | Flow_04ui7gq | Activity_0ksn5ed | R1 |
| 47 | Activity_0mdfih5 | Flow_04ui7gq | — | Activity_0ksn5ed | Flow_0juhkmb | Activity_1019azk | R1 |
| 48 | Activity_0ksn5ed | Flow_0juhkmb | наклеена корректно | Activity_1019azk | Flow_0arviz6 | Activity_12z3j99 | R1 |
| 49 | Activity_1019azk | Flow_0arviz6 | — | Activity_12z3j99 | Flow_02iprom | Activity_1kp4c93 | R1 |
| 50 | Activity_12z3j99 | Flow_02iprom | — | Activity_1kp4c93 | Flow_0f8zrme | Activity_0ppebcj | R1 |
| 51 | Activity_1kp4c93 | Flow_0f8zrme | пакет целый, без прокола | Activity_0ppebcj | Flow_05uk8kz | Gateway_13frvr2 | R1 |
| 52 | Activity_0ppebcj | Flow_05uk8kz | — | Gateway_13frvr2 | Flow_1pc3ucn | Gateway_1kdlvf8 | R1 |
| 53 | Gateway_13frvr2 | Flow_1pc3ucn | Нет | Gateway_1kdlvf8 | Flow_175fc18 | Activity_0hw9udd | R1 |
| 54 | Gateway_1kdlvf8 | Flow_175fc18 | Нет | Activity_0hw9udd | Flow_1lmi10n | Activity_0adbnrz | R1 |
| 55 | Activity_0hw9udd | Flow_1lmi10n | — | Activity_0adbnrz | Flow_1qyipl7 | Activity_0mzydsr | R1 |
| 56 | Activity_0adbnrz | Flow_1qyipl7 | — | Activity_0mzydsr | Flow_01k4laz | Activity_0i0it93 | R1 |
| 57 | Activity_0mzydsr | Flow_01k4laz | — | Activity_0i0it93 | Flow_1ub7gwa | Activity_1r77ain | R1 |
| 58 | Activity_0i0it93 | Flow_1ub7gwa | — | Activity_1r77ain | Flow_02du2dp | Activity_1d89hw2 | R1 |
| 59 | Activity_1r77ain | Flow_02du2dp | — | Activity_1d89hw2 | Flow_0pru7c3 | Activity_1ixcfjj | R1 |
| 60 | Activity_1d89hw2 | Flow_0pru7c3 | заказ размещён в правильной ячейке/полке, дверца закрыта. | Activity_1ixcfjj | Flow_1cz5s63 | Activity_00t6ixs | R1 |
| 61 | Activity_1ixcfjj | Flow_1cz5s63 | — | Activity_00t6ixs | Flow_1ndeuot | Event_1pqduoq | R1 |
| 62 | Activity_00t6ixs | Flow_1ndeuot | — | Event_1pqduoq | — | — | R1 |

## R2 Trace
### R2 #1
- nodeId: `Event_05ckyt4`
- title: Заказ на суп
- lane: Работа сотрудника
- viaFlowId: —
- branchContext: —
- graphNo: 1
- stopReason: —

### R2 #2
- nodeId: `Event_0n3sbnt`
- title: Звуковой сигнал о новом заказе
- lane: Работа сотрудника
- viaFlowId: Flow_1f9se1h
- branchContext: —
- graphNo: 43
- stopReason: —

### R2 #3
- nodeId: `Activity_01pgxk6`
- title: Сотрудник подходит к компьютеру
- lane: Работа сотрудника
- viaFlowId: Flow_1opvtxu
- branchContext: —
- graphNo: 44
- stopReason: —

### R2 #4
- nodeId: `Activity_0m37490`
- title: Посмотреть состав заказа в ВВ партнер
- lane: Работа программы сборки
- viaFlowId: Flow_00ntdu7
- branchContext: —
- graphNo: 45
- stopReason: —

### R2 #5
- nodeId: `Activity_17t320o`
- title: Нажать кнопку "Начать сборку"
- lane: Работа программы сборки
- viaFlowId: Flow_0uo9mwm
- branchContext: —
- graphNo: 46
- stopReason: —

### R2 #6
- nodeId: `Gateway_0d27wqt`
- title: Появилась кнопка "передать в доставку"?
- lane: Работа программы сборки
- viaFlowId: Flow_194a7it
- branchContext: —
- graphNo: 47
- stopReason: —

### R2 #7
- nodeId: `Activity_1fbaouj`
- title: Нажать повторно кнопку "Начать сборку"
- lane: Работа программы сборки
- viaFlowId: Flow_1einwy2
- branchContext: Gateway_0d27wqt :: Нет
- graphNo: 62
- stopReason: —

### R2 #8
- nodeId: `Gateway_0yfbohy`
- title: Появилась кнопка "передать в доставку"?
- lane: Работа программы сборки
- viaFlowId: Flow_0c3fhuz
- branchContext: —
- graphNo: 110
- stopReason: —

### R2 #9
- nodeId: `Activity_0zaagzy`
- title: Повторить/обновить/позвать старшего
- lane: Работа программы сборки
- viaFlowId: Flow_1nlxxyj
- branchContext: Gateway_0yfbohy :: Нет
- graphNo: 63
- stopReason: —

### R2 #10
- nodeId: `Gateway_1prds00`
- title: Проблема решена?
- lane: Работа программы сборки
- viaFlowId: Flow_08gov38
- branchContext: —
- graphNo: 111
- stopReason: —

### R2 #11
- nodeId: `Event_1aulnyq`
- title: Event_1aulnyq
- lane: Работа программы сборки
- viaFlowId: Flow_02mqvh5
- branchContext: Gateway_1prds00 :: Нет
- graphNo: —
- stopReason: escalation

| # | Откуда (node) | Flow | Условие | Шаг (node) | Flow | Куда (node) | R-tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | — | — | — | Event_05ckyt4 | Flow_1f9se1h | Event_0n3sbnt | R2 |
| 2 | Event_05ckyt4 | Flow_1f9se1h | — | Event_0n3sbnt | Flow_1opvtxu | Activity_01pgxk6 | R2 |
| 3 | Event_0n3sbnt | Flow_1opvtxu | — | Activity_01pgxk6 | Flow_00ntdu7 | Activity_0m37490 | R2 |
| 4 | Activity_01pgxk6 | Flow_00ntdu7 | — | Activity_0m37490 | Flow_0uo9mwm | Activity_17t320o | R2 |
| 5 | Activity_0m37490 | Flow_0uo9mwm | — | Activity_17t320o | Flow_194a7it | Gateway_0d27wqt | R2 |
| 6 | Activity_17t320o | Flow_194a7it | 2 секунды | Gateway_0d27wqt | Flow_1einwy2 | Activity_1fbaouj | R2 |
| 7 | Gateway_0d27wqt | Flow_1einwy2 | Нет | Activity_1fbaouj | Flow_0c3fhuz | Gateway_0yfbohy | R2 |
| 8 | Activity_1fbaouj | Flow_0c3fhuz | — | Gateway_0yfbohy | Flow_1nlxxyj | Activity_0zaagzy | R2 |
| 9 | Gateway_0yfbohy | Flow_1nlxxyj | Нет | Activity_0zaagzy | Flow_08gov38 | Gateway_1prds00 | R2 |
| 10 | Activity_0zaagzy | Flow_08gov38 | — | Gateway_1prds00 | Flow_02mqvh5 | Event_1aulnyq | R2 |
| 11 | Gateway_1prds00 | Flow_02mqvh5 | Нет | Event_1aulnyq | — | — | R2 |

## Алгоритм извлечения (как построены трассы)
1. База графа: BPMN XML `sequenceFlow(sourceRef,targetRef,label)` + узлы/gateway + lane map.
2. Interview numbering: `interview.path_spec.steps.order_index` маппится на `bpmn_ref` и используется как deterministic rank (`graphNo`).
3. R0:
   - На XOR: сначала meta-tier `R0/P0` (если есть), иначе `default` flow, иначе fallback: выбрать outgoing с достижимостью success-end и минимальным rank/дистанцией.
   - Идти до End.
4. R1:
   - Найти первый gateway на R0, где есть альтернативный outgoing, который тоже достигает success-end.
   - На этом gateway выбрать альтернативу (один ключевой decision point), дальше идти по R0-policy до End.
   - Loop: максимум 1 итерация.
5. R2:
   - От старта на gateway предпочитать outgoing, достигающий stop-end (fail/escalation target).
   - Идти до stop-node (`Event_1aulnyq`), при цикле максимум 1 итерация.
6. Комбинации веток не генерируются; построены репрезентативные трассы.

## Наблюдения для автоматизации
- В сессии отсутствует сохранённая flow-tier meta (`bpmn_meta.flow_meta` пуст), поэтому `flowId -> R-tier` в decision table дан как trace-derived (по попаданию flow в R0/R1/R2 репрезентативные трассы).
- Для автоматизации нужны: `sequenceFlow(sourceRef,targetRef,name)`, `gateway default`, `interview.path_spec.steps(order_index,bpmn_ref)` для ранжирования, и явная `flow_meta tier` для снятия неоднозначности.
- Неоднозначность: gateway с несколькими outgoing и без tier/default; в этом отчёте применяется детерминированный fallback (reachable success/fail + graphNo rank).
- Циклы: обнаружен SCC в блоке `Gateway_1prds00/Activity_1fbaouj/Gateway_0yfbohy/Activity_0zaagzy`; в генераторе трасс ограничение `1` итерация и stopReason `loop` при невозможности выхода.
