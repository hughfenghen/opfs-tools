import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { ThemeProvider, CssBaseline } from '@mui/material';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import {
  Tree,
  MultiBackend,
  DragLayerMonitorProps,
  getDescendants,
  getBackendOptions,
} from '@minoru/react-dnd-treeview';
import { NodeModel, CustomData, DropOptions } from './types';
import { CustomNode } from './CustomNode';
import { CustomDragPreview } from './CustomDragPreview';
import { AddDialog, NewNodeType } from './AddDialog';
import { theme } from './theme';
import styles from './App.module.css';
import { file, dir, write } from '../../../src';
import { FilePreviewer } from './FilePreviewer';
import { dirTree, fsItem2TreeNode, treeDataAtom } from './common';
import { useAtom } from 'jotai';

async function initFiles() {
  if ((await dir('/').children()).length > 1) return;

  await write('/opfs-tools/dir1/file1', 'file');
  await write('/opfs-tools/dir1/file2', 'file');
  await write('/opfs-tools/dir2/file1', 'file');
  await dir('/.Trush').create();
}

async function getInitData(dirPath: string, rs: NodeModel<CustomData>[]) {
  for (const it of await dir(dirPath).children()) {
    rs.push(fsItem2TreeNode(it));
    if (it.kind === 'dir') {
      await getInitData(it.path, rs);
    }
  }
}

function joinPath(p1: string, p2: string) {
  return `${p1}/${p2}`.replace('//', '/');
}

function App() {
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const handleDrop = async (
    _: NodeModel<CustomData>[],
    changeData: DropOptions<CustomData>
  ) => {
    const newDir = await (changeData.dragSource.kind === 'dir' ? dir : file)(
      changeData.dragSourceId
    ).moveTo(dir(changeData.dropTargetId));
    const newData = (await dirTree(newDir)).map((it) => fsItem2TreeNode(it));

    const deleteIds = getDescendants(treeData, changeData.dragSource.id)
      .map((node) => node.id)
      .concat(changeData.dragSource.id)
      .concat(newData.map((it) => it.id));

    const newTree = treeData
      .filter((node) => !deleteIds.includes(node.id))
      .concat(newData);

    setTreeData(newTree);
  };
  const [openAddDialog, setOpenAddDialog] = useState<boolean>(false);
  const [selectId, setSelectId] = useState('');

  useEffect(() => {
    (async () => {
      await initFiles();
      const tree = [fsItem2TreeNode(dir('/'))];
      await getInitData('/', tree);
      setTreeData(tree);
    })();
  }, []);

  const handleSubmit = async ({
    nodeType,
    path,
    files,
  }: {
    nodeType: NewNodeType;
    path: string;
    files?: File[];
  }) => {
    const p = joinPath('/', path);
    let fsItems = [];
    if (nodeType === 'dir') {
      fsItems.push(await dir(p).create());
    } else if (nodeType === 'file') {
      await write(p, '');
      fsItems.push(file(p));
    } else if (nodeType === 'import' && files?.length > 0) {
      await Promise.all(files.map((f) => write(f.name, f.stream())));
      fsItems.push(...files.map((f) => file(joinPath('/', f.name))));
    }

    setTreeData([...treeData, ...fsItems.map((it) => fsItem2TreeNode(it))]);
    setOpenAddDialog(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DndProvider backend={MultiBackend} options={getBackendOptions()}>
        <div className={styles.app} onClick={() => setSelectId('')}>
          <div>
            <Button
              onClick={() => setOpenAddDialog(true)}
              startIcon={<AddIcon />}
            >
              Add
            </Button>
            {openAddDialog && (
              <AddDialog
                tree={treeData}
                onClose={() => setOpenAddDialog(false)}
                onSubmit={handleSubmit}
              />
            )}
          </div>
          <Tree
            tree={treeData}
            rootId={'/'}
            render={(node: NodeModel<CustomData>, options) => (
              <CustomNode node={node} {...options} onPreview={setSelectId} />
            )}
            dragPreviewRender={(
              monitorProps: DragLayerMonitorProps<CustomData>
            ) => <CustomDragPreview monitorProps={monitorProps} />}
            onDrop={handleDrop}
            classes={{
              root: styles.treeRoot,
              draggingSource: styles.draggingSource,
              dropTarget: styles.dropTarget,
            }}
          />
          {selectId !== '' && (
            <FilePreviewer
              tree={treeData}
              id={selectId}
              onClose={() => setSelectId('')}
            ></FilePreviewer>
          )}
        </div>
      </DndProvider>
    </ThemeProvider>
  );
}

export default App;
