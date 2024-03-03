import React from 'react';
import IconButton from '@mui/material/IconButton';
import { Delete, FileCopy } from '@mui/icons-material';
import IosShareIcon from '@mui/icons-material/IosShare';
import { CustomData, NodeModel } from './types';
import styles from './FSItemOps.module.css';
import { dirTree, fsItem2TreeNode, treeDataAtom } from './common';
import { useAtom } from 'jotai';
import { getDescendants } from '@minoru/react-dnd-treeview';
import { dir, file } from '../../../src';
import { joinPath } from '../../../src/common';

type Props = {
  node: NodeModel<CustomData>;
  onChange?: (
    type: 'delete' | 'copy',
    newNode: NodeModel<CustomData> | null
  ) => void;
};

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

export const FSItemOps: React.FC<Props> = ({ node, onChange }) => {
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const id = node.id;

  const handleDelete = async () => {
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
      onChange?.('delete', null);
    } else if (opNode.kind === 'dir') {
      const newDir = await dir(id).moveTo(dir('/.Trush'));
      newData.push(...(await dirTree(newDir)).map((it) => fsItem2TreeNode(it)));
    } else {
      const sameNameInTrush = await file('/.Trush/' + file(id).name).exists();
      const newFile = await file(id).moveTo(dir('/.Trush'));
      onChange?.('delete', fsItem2TreeNode(newFile));
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

  const handleCopy = async () => {
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

    const suffix = targetNode.text.includes('.')
      ? `.${targetNode.text.split('.').slice(-1)}`
      : '';
    const fileName = targetNode.text.includes('.')
      ? targetNode.text.split('.').slice(0, -1)
      : targetNode.text;
    const newName = /copy\d+$/.test(targetNode.text)
      ? targetNode.text.replace(/copy\d+/, String(copyedCnt + 1))
      : fileName + ' copy' + (copyedCnt + 1) + suffix;

    const newNode = {
      ...targetNode,
      text: newName,
      id: joinPath(targetNode.parent, newName),
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

    onChange?.('copy', newNode);
    setTreeData([...treeData, newNode, ...childrenNodes, ...partialTree]);
  };

  return (
    <>
      <div className={styles.actionButton}>
        <IconButton size="small" onClick={handleDelete}>
          <Delete fontSize="small" />
        </IconButton>
      </div>
      <div className={styles.actionButton}>
        <IconButton size="small" onClick={handleCopy}>
          <FileCopy fontSize="small" />
        </IconButton>
      </div>
      {node.kind === 'file' && (
        <div className={styles.actionButton}>
          <IconButton
            size="small"
            onClick={() => {
              downloadFile(file(id));
            }}
          >
            <IosShareIcon fontSize="small" />
          </IconButton>
        </div>
      )}
    </>
  );
};
