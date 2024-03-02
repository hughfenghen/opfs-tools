import React, { useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { NodeModel } from './types';
import styles from './FilePreviewer.module.css';

type Props = {
  tree: NodeModel[];
  id: string;
  onClose: () => void;
};

export const FilePreviewer: React.FC<Props> = (props) => {
  return (
    <div
      className={styles.filePreviewer}
      onClick={(evt) => {
        evt.stopPropagation();
        evt.preventDefault();
      }}
    >
      <div className={styles.closeIconWrap} onClick={props.onClose}>
        <CloseIcon></CloseIcon>
      </div>
    </div>
  );
};
