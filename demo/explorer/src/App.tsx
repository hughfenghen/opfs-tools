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
import { detectFileType } from './utils';

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

type FSItem = ReturnType<typeof dir> | ReturnType<typeof file>;

async function dirTree(it: FSItem): Promise<Array<FSItem>> {
  if (it.kind === 'file') return [it];
  return (await it.children()).reduce(
    async (acc, cur) => [...(await acc), ...(await dirTree(cur))],
    Promise.resolve([it])
  );
}

function fsItem2TreeNode(it: FSItem) {
  return {
    id: it.path,
    parent: it.parent?.path,
    droppable: it.kind === 'dir',
    kind: it.kind,
    text: it.name,
    data: {
      fileType: detectFileType(it.path),
      fileSize: '0KB',
    },
  };
}

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

async function downloadFile(f: ReturnType<typeof file>) {
  const url = URL.createObjectURL(new Blob([await f.arrayBuffer()]));
  const aEl = document.createElement('a');
  document.body.appendChild(aEl);
  aEl.setAttribute('href', url);
  aEl.setAttribute('download', f.name);
  aEl.setAttribute('target', '_self');
  aEl.click();
  aEl.remove();
}

function App() {
  const [treeData, setTreeData] = useState<NodeModel<CustomData>[]>([]);
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
  const [selectId, setSelectId] = useState(
    '/f91da7da3ebb478cb4ecd9c1cdd109cf.gif'
  );

  useEffect(() => {
    (async () => {
      await initFiles();
      const tree = [fsItem2TreeNode(dir('/'))];
      await getInitData('/', tree);
      setTreeData(tree);
    })();
  }, []);

  const handleDelete = async (id: NodeModel['id']) => {
    const deleteIds = getDescendants(treeData, id).map((node) => node.id);

    const opNode = treeData.find((it) => it.id === id);
    // 删除垃圾筐操作，是清空垃圾筐，垃圾筐本身不能删除
    if (id !== '/.Trush') deleteIds.push(id);

    let newData = [];
    if (id === '/.Trush') {
      (await dir('/.Trush').children()).forEach(
        async (it) => await it.remove()
      );
    } else if (id.startsWith('/.Trush/')) {
      await (opNode.kind === 'dir' ? dir : file)(id).remove();
    } else if (opNode.kind === 'dir') {
      const newDir = await dir(id).moveTo(dir('/.Trush'));
      newData.push(...(await dirTree(newDir)).map((it) => fsItem2TreeNode(it)));
    } else {
      const sameNameInTrush = await file('/.Trush/' + file(id).name).exists();
      const newFile = await file(id).moveTo(dir('/.Trush'));
      if (!sameNameInTrush) {
        newData.push(fsItem2TreeNode(newFile));
      }
    }
    // 避免 id 重复
    deleteIds.push(...newData.map((it) => it.id));
    setTreeData(
      treeData.filter((node) => !deleteIds.includes(node.id)).concat(newData)
    );
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

      childrenNodes.push(
        ...(await dirTree(copyedDir)).slice(1).map((it) => fsItem2TreeNode(it))
      );
    } else {
      await file(id).copyTo(file(newNode.id));
    }

    setTreeData([...treeData, newNode, ...childrenNodes, ...partialTree]);
  };

  const handleExport = (id: string) => {
    downloadFile(file(id));
  };

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
              <CustomNode
                node={node}
                {...options}
                onDelete={handleDelete}
                onCopy={handleCopy}
                onExport={handleExport}
                onPreview={setSelectId}
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
