import React from 'react';
import './XPBadge.css';

export default function XPBadge({ level, levelName, icon, color, small = false }) {
  if (!level) return null;
  return (
    <span
      className={`xpbadge ${small ? 'xpbadge--small' : ''}`}
      style={{ '--badge-color': color || '#94a3b8' }}
      title={levelName}
    >
      {icon} <span className="xpbadge-num">Lv.{level}</span>
    </span>
  );
}
