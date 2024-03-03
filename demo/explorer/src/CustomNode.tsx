import React, { useState } from 'react';
import Typography from '@mui/material/Typography';
import { ArrowRight } from '@mui/icons-material';
import { useDragOver } from '@minoru/react-dnd-treeview';
import { NodeModel, CustomData } from './types';
import { TypeIcon } from './TypeIcon';
import styles from './CustomNode.module.css';
import { FSItemOps } from './FSItemOps';

type Props = {
  node: NodeModel<CustomData>;
  depth: number;
  isOpen: boolean;
  onToggle: (id: NodeModel['id']) => void;
  onPreview: (id: NodeModel['id']) => void;
};

export const CustomNode: React.FC<Props> = (props) => {
  const [hover, setHover] = useState<boolean>(false);
  const { id, droppable, data } = props.node;
  const indent = props.depth * 24;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    props.onToggle(props.node.id);
  };

  const dragOverProps = useDragOver(id, props.isOpen, props.onToggle);

  return (
    <div
      className={`tree-node ${styles.root}`}
      style={{ paddingInlineStart: indent }}
      {...dragOverProps}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`${styles.expandIconWrapper} ${
          props.isOpen ? styles.isOpen : ''
        }`}
      >
        {props.node.droppable && (
          <div onClick={handleToggle}>
            <ArrowRight />
          </div>
        )}
      </div>
      <div>
        <TypeIcon droppable={droppable} fileType={data?.fileType} />
      </div>
      <div
        className={styles.labelGridItem}
        onClick={(evt) => {
          if (props.node.kind === 'file') {
            evt.stopPropagation();
            evt.preventDefault();
            props.onPreview(id);
          }
        }}
      >
        <Typography variant="body2">{props.node.text}</Typography>
      </div>
      {hover && <FSItemOps node={props.node}></FSItemOps>}
    </div>
  );
};
