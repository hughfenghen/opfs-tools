import React, { useState } from 'react';
import {
  Button,
  RadioGroup,
  TextField,
  FormControlLabel,
  Radio,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { MuiFileInput } from 'mui-file-input';
import { NodeModel } from './types';
import styles from './AddDialog.module.css';

export type NewNodeType = 'file' | 'dir' | 'import';

type Props = {
  tree: NodeModel[];
  onClose: () => void;
  onSubmit: (e: {
    nodeType: NewNodeType;
    path: string;
    files?: File[];
  }) => void;
};

export const AddDialog: React.FC<Props> = (props) => {
  const [path, setPath] = useState('');
  const [nodeType, setNodeType] = useState<'file' | 'dir' | 'import'>('file');

  const [files, setFiles] = React.useState([]);

  const handleImpFileChange = (newFiles: File[]) => {
    setFiles(newFiles);
  };

  const handleChangeText = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPath(e.target.value);
  };

  return (
    <Dialog open={true} onClose={props.onClose}>
      <DialogTitle>Add New Node</DialogTitle>
      <DialogContent className={styles.content}>
        <div>
          <RadioGroup
            row
            onChange={(e) => setNodeType(e.target.value as typeof nodeType)}
            value={nodeType}
          >
            <FormControlLabel value="file" control={<Radio />} label="File" />
            <FormControlLabel value="dir" control={<Radio />} label="Dir" />
            <FormControlLabel
              value="import"
              control={<Radio />}
              label="Import"
            />
          </RadioGroup>
        </div>
        <div>
          {nodeType === 'import' ? (
            <MuiFileInput
              multiple
              value={files}
              onChange={handleImpFileChange}
              clearIconButtonProps={{
                title: 'Remove',
                children: <CloseIcon fontSize="small" />,
              }}
              InputProps={{
                startAdornment: <AttachFileIcon />,
              }}
            ></MuiFileInput>
          ) : (
            <TextField
              label="path"
              onChange={handleChangeText}
              value={path}
              fullWidth
            />
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          disabled={path === '' && files.length === 0}
          onClick={() =>
            props.onSubmit({
              nodeType,
              path,
              files,
            })
          }
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};
