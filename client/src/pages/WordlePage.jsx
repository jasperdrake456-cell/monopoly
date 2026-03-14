import React from 'react';
import { useNavigate } from 'react-router-dom';
import Wordle from '../games/Wordle';

export default function WordlePage() {
  const navigate = useNavigate();
  return <Wordle onBack={() => navigate('/')} />;
}
