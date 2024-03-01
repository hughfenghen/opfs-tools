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
import { AddDialog } from './AddDialog';
import { theme } from './theme';
import styles from './App.module.css';
import { file, dir, write } from '../../../src';

const getLastId = (treeData: NodeModel[]) => {
  const reversedArray = [...treeData].sort((a, b) => {
    if (a.id < b.id) {
      return 1;
    } else if (a.id > b.id) {
      return -1;
    }

    return 0;
  });

  if (reversedArray.length > 0) {
    return reversedArray[0].id;
  }

  return 0;
};

async function initFiles() {
  if ((await dir('/').children()).length > 1) return;

  await write('/opfs-tools/dir1/file1', 'file');
  await write('/opfs-tools/dir1/file2', 'file');
  await write('/opfs-tools/dir2/file1', 'file');
  await dir('/.Trush').create();
}

async function getInitData(dirPath: string, rs: NodeModel<CustomData>[]) {
  for (const it of await dir(dirPath).children()) {
    rs.push({
      id: it.path,
      parent: it.parent.path,
      droppable: it.kind === 'dir',
      kind: it.kind,
      text: it.name,
      data: {
        fileType: 'text',
        fileSize: '0KB',
      },
    });
    if (it.kind === 'dir') {
      await getInitData(it.path, rs);
    }
  }
}

function App() {
  const [treeData, setTreeData] = useState<NodeModel<CustomData>[]>([]);
  const handleDrop = async (
    newTree: NodeModel<CustomData>[],
    changeData: DropOptions<CustomData>
  ) => {
    await (changeData.dragSource.kind === 'dir' ? dir : file)(
      changeData.dragSourceId
    ).moveTo(dir(changeData.dropTargetId));
    setTreeData(newTree);
  };
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      await initFiles();
      const tree = [
        {
          id: '/',
          parent: null,
          droppable: false,
          kind: 'dir' as const,
          text: 'root',
          data: {
            fileType: 'text',
            fileSize: '0KB',
          },
        },
      ];
      await getInitData('/', tree);
      setTreeData(tree);
    })();
  }, []);

  const handleDelete = async (id: NodeModel['id']) => {
    const deleteIds = getDescendants(treeData, id).map((node) => node.id);

    const opNode = treeData.find((it) => it.id === id);
    // 删除垃圾筐操作，是清空垃圾筐，垃圾筐本身不能删除
    if (id !== '/.Trush') deleteIds.push(id);

    const newTree = treeData.filter((node) => !deleteIds.includes(node.id));

    if (id === '/.Trush') {
      (await dir('/.Trush').children()).forEach(
        async (it) => await it.remove()
      );
    } else if (id.startsWith('/.Trush/')) {
      await (opNode.kind === 'dir' ? dir : file)(id).remove();
    } else if (opNode.kind === 'dir') {
      await dir(id).moveTo(dir('/.Trush'));
    } else {
      const sameNameInTrush = await file('/.Trush/' + file(id).name).exists();
      const newFile = await file(id).moveTo(dir('/.Trush'));
      if (!sameNameInTrush) {
        newTree.push({
          id: newFile.path,
          parent: newFile.parent.path,
          kind: newFile.kind,
          droppable: false,
          text: newFile.name,
          data: {
            fileType: 'text',
            fileSize: '0KB',
          },
        });
      }
    }

    setTreeData(newTree);
  };

  const handleCopy = async (id: NodeModel['id']) => {
    const lastId = getLastId(treeData);
    const targetNode = treeData.find((n) => n.id === id);
    const descendants = getDescendants(treeData, id);
    const partialTree = descendants.map((node: NodeModel<CustomData>) => ({
      ...node,
      id: node.id + lastId,
      parent: node.parent + lastId,
    }));

    const copyedCnt = treeData.filter(
      (n) =>
        n.parent === targetNode.parent &&
        n.text.startsWith(targetNode.text.replace(/ copy\d+$/, '') + ' copy')
    ).length;

    const newName = /copy\d+$/.test(targetNode.text)
      ? targetNode.text.replace(/\d+$/, String(copyedCnt + 1))
      : targetNode.text + ' copy' + (copyedCnt + 1);
    const newNode = {
      ...targetNode,
      text: newName,
      id: targetNode.parent + '/' + newName,
    };
    const childrenNodes = [];
    if (targetNode.kind === 'dir') {
      const copyedDir = await dir(id).copyTo(dir(newNode.id));
      async function dirTree(
        it: ReturnType<typeof dir> | ReturnType<typeof file>
      ): Promise<Array<ReturnType<typeof dir> | ReturnType<typeof file>>> {
        if (it.kind === 'file') return [it];
        return (await it.children()).reduce(
          async (acc, cur) => [...(await acc), ...(await dirTree(cur))],
          Promise.resolve([it])
        );
      }
      childrenNodes.push(
        ...(await dirTree(copyedDir)).slice(1).map((it) => ({
          id: it.path,
          parent: it.parent.path,
          droppable: it.kind === 'dir',
          kind: it.kind,
          text: it.name,
          data: {
            fileType: 'text',
            fileSize: '0KB',
          },
        }))
      );
    } else {
      await file(id).copyTo(file(newNode.id));
    }

    setTreeData([...treeData, newNode, ...childrenNodes, ...partialTree]);
  };

  const handleOpenDialog = () => {
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
  };

  const handleSubmit = (newNode: Omit<NodeModel<CustomData>, 'id'>) => {
    // const lastId = getLastId(treeData) + 1;
    // setTreeData([
    //   ...treeData,
    //   {
    //     ...newNode,
    //     id: lastId,
    //   },
    // ]);
    // setOpen(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DndProvider backend={MultiBackend} options={getBackendOptions()}>
        <div className={styles.app}>
          <div>
            <Button onClick={handleOpenDialog} startIcon={<AddIcon />}>
              Add Node
            </Button>
            {open && (
              <AddDialog
                tree={treeData}
                onClose={handleCloseDialog}
                onSubmit={handleSubmit}
              />
            )}
          </div>
          <Tree
            tree={treeData}
            rootId={'/'}
            render={(node: NodeModel<CustomData>, options) => (
              <CustomNode
                node={node}
                {...options}
                onDelete={handleDelete}
                onCopy={handleCopy}
              />
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
        </div>
      </DndProvider>
    </ThemeProvider>
  );
}

export default App;
