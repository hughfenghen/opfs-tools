export type CustomData = {
  fileType: string;
};

export type NodeModel<T = unknown> = {
  id: string;
  parent: string | null;
  droppable?: boolean;
  text: string;
  data?: T;
};

export type DropOptions<T = unknown> = {
  dragSourceId: NodeModel['id'];
  dropTargetId: NodeModel['id'];
  dragSource: NodeModel<T> | undefined;
  dropTarget: NodeModel<T> | undefined;
  destinationIndex?: number;
};
