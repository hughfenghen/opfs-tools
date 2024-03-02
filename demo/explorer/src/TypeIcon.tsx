import React from 'react';
import FolderIcon from '@mui/icons-material/Folder';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';

type Props = {
  droppable: boolean;
  fileType?: string;
};

export const TypeIcon: React.FC<Props> = (props) => {
  if (props.droppable) {
    return <FolderIcon />;
  }

  switch (props.fileType) {
    case 'image':
      return <ImageIcon />;
    case 'video':
      return <PlayCircleIcon />;
    case 'audio':
      return <AudiotrackIcon />;
    case 'text':
      return <DescriptionIcon />;
    default:
      return null;
  }
};
