import { foldEvents, type ContourModel, type RawEvent } from "agent-flow-core";
import { Camera } from "./canvas/camera.js";
import { Interaction } from "./canvas/interaction.js";
import { Renderer } from "./canvas/renderer.js";
import { InspectorPanel } from "./inspector/panel.js";
import { TimelineController } from "./timeline/controller.js";
import { TimelineUI } from "./timeline/ui.js";

export interface AppOptions {
  root: HTMLElement;
  events: RawEvent[];
}

export class App {
  private readonly root: HTMLElement;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly timelineController: TimelineController;
  private readonly timelineUI: TimelineUI;
  private readonly inspector: InspectorPanel;

  constructor(options: AppOptions) {
    this.root = options.root;
    this.root.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;";

    const canvasContainer = document.createElement("div");
    canvasContainer.style.cssText = "flex:1;position:relative;overflow:hidden;";

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    canvasContainer.append(canvas);

    const inspectorContainer = document.createElement("div");
    canvasContainer.append(inspectorContainer);

    const timelineContainer = document.createElement("div");

    this.root.append(canvasContainer, timelineContainer);

    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera);

    const model = foldEvents(options.events);
    const viewport = this.renderer.setModel(model);
    this.camera.fit(viewport, canvas.clientWidth, canvas.clientHeight);

    this.timelineController = new TimelineController(options.events, {
      onUpdate: (m) => this.handleTimelineUpdate(m),
    });

    this.timelineUI = new TimelineUI(timelineContainer, this.timelineController);

    this.inspector = new InspectorPanel(inspectorContainer);

    new Interaction(
      canvas,
      this.camera,
      () => this.renderer.getNodes(),
      {
        onSelectNode: (node) => {
          if (node) this.inspector.showNode(node);
          else this.inspector.hide();
        },
        onPan: () => this.renderer.render(),
        onZoom: () => this.renderer.render(),
      }
    );

    window.addEventListener("resize", () => {
      this.renderer.resize();
      this.renderer.render();
    });

    this.renderer.start();
  }

  private handleTimelineUpdate(model: ContourModel[]): void {
    this.renderer.setModel(model);
    this.renderer.render();
    this.timelineUI.setIndex(this.timelineController.currentIndex);
  }
}

