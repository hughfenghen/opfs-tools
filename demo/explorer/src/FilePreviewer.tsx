import React, { useState, useEffect } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import { NodeModel } from './types';
import styles from './FilePreviewer.module.css';
import { file, write } from '../../../src';

type Props = {
  tree: NodeModel[];
  id: string;
  onClose: () => void;
};

export const FilePreviewer: React.FC<Props> = ({ id, onClose }) => {
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
      <FileContent id={id}></FileContent>
    </div>
  );
};

function detectFileType(path: string): 'video' | 'audio' | 'image' | 'text' {
  if (/\.(mp4|av1|ogg|webm|mov)$/.test(path)) return 'video';
  if (/\.(m4a|mp3)$/.test(path)) return 'audio';
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(path)) return 'image';

  return 'text';
}

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
