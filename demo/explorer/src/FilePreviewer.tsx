import React, { useState, useEffect } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { CustomData, NodeModel } from './types';
import styles from './FilePreviewer.module.css';
import { file, write } from '../../../src';
import { detectFileType, previewNodeAtom } from './common';
import { FSItemOps } from './FSItemOps';
import { useAtom } from 'jotai';

type Props = {
  tree: NodeModel[];
  node: NodeModel<CustomData>;
  onClose: () => void;
};

export const FilePreviewer: React.FC<Props> = ({ node, onClose }) => {
  const id = node.id;
  const [_, setPreviewNode] = useAtom(previewNodeAtom);
  return (
    <div
      className={styles.filePreviewer}
      onClick={(evt) => {
        evt.stopPropagation();
        evt.preventDefault();
      }}
    >
      <div className={styles.closeIconWrap} onClick={onClose}>
        <CloseIcon></CloseIcon>
      </div>
      <div className={styles.info}>{id}</div>
      <div style={{ display: 'flex', marginBottom: '8px' }}>
        <FSItemOps
          node={node}
          onChange={(_, newNode) => setPreviewNode(newNode ?? false)}
        ></FSItemOps>
      </div>
      <FileContent id={id}></FileContent>
    </div>
  );
};

const FileContent: React.FC<{ id: string }> = ({ id }) => {
  const [text, setText] = useState('');
  const fileType = detectFileType(id);

  useEffect(() => {
    setText('');
    (async () => {
      if (['video', 'audio', 'image'].includes(fileType)) {
        setText(URL.createObjectURL(new Blob([await file(id).arrayBuffer()])));
      } else {
        setText(await file(id).text());
      }
    })();

    return () => {
      URL.revokeObjectURL(text);
    };
  }, [id]);

  return (
    <>
      {fileType === 'video' && <video controls src={text}></video>}
      {fileType === 'audio' && <audio controls src={text}></audio>}
      {fileType === 'image' && <img src={text}></img>}
      {fileType === 'text' && (
        <>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(evt) => {
              setText(evt.target.value);
            }}
          />
          <div className={styles.saveBtn}>
            <Button
              variant="contained"
              onClick={async () => {
                await write(id, text);
              }}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </>
  );
};
