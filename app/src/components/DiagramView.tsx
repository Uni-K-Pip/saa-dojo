import type { AnyDiagramScene } from '../content/types';
import { Diagram } from './Diagram';
import { DecisionDiagram, LayersDiagram, PositionDiagram, TimelineDiagram } from './DiagramChart';

export function DiagramView({ scene, step, ...props }: {
  scene: AnyDiagramScene;
  step?: number;
  caption?: string;
  altId?: string;
}) {
  switch (scene.type) {
    case 'architecture': return <Diagram scene={scene} step={step} {...props} />;
    case 'decision': return <DecisionDiagram scene={scene} {...props} />;
    case 'position': return <PositionDiagram scene={scene} {...props} />;
    case 'timeline': return <TimelineDiagram scene={scene} {...props} />;
    case 'layers': return <LayersDiagram scene={scene} {...props} />;
  }
}

export default DiagramView;
