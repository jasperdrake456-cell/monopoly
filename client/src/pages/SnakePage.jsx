import React from 'react';
import { useNavigate } from 'react-router-dom';
import Snake from '../games/Snake';

export default function SnakePage() {
  const navigate = useNavigate();
  return <Snake onBack={() => navigate('/')} />;
}
