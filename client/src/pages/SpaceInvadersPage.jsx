import React from 'react';
import { useNavigate } from 'react-router-dom';
import SpaceInvaders from '../games/SpaceInvaders';

export default function SpaceInvadersPage() {
  const navigate = useNavigate();
  return <SpaceInvaders onBack={() => navigate('/')} />;
}
