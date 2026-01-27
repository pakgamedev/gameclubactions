import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo } from '@devvit/web/client';

import './styles.css'; // optional, or inline styles

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'jam' | 'awards' | 'club'>('jam');

  return (
    <div className="app-root">
      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'jam' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('jam')}
        >
          Join the Jam
        </button>
        <button
          className={`tab ${activeTab === 'awards' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('awards')}
        >
          Pakistan Game Awards
        </button>
        <button
          className={`tab ${activeTab === 'club' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('club')}
        >
          Game Dev Club
        </button>
      </div>

      {/* Content */}
      <div className="content">
      {(() => {
        switch (activeTab) {
          case 'jam':
            return <JoinTheJam />
          case 'club':
            return <GameClub />
          default:
            return <PakistanGameAwards />
        }
      })()}
    </div>
    </div>
  );
};

const JoinTheJam: React.FC = () => {
  const handleJoinClick = () => {
    // Opens external URL; Reddit will show a confirmation dialog for external URLs
    navigateTo('https://www.reddit.com/r/PakGameDev/comments/1n30cl4');
  };

  return (
    <div className="jam banner">
      <div className="jam-overlay">
        <h1 className="jam-title">Pakistan Game Jam</h1>
        <button className="primary-cta" onClick={handleJoinClick}>
          Join Now
        </button>
      </div>
    </div>
  );
};

const GameClub: React.FC = () => {
  const handleJoinClick = () => {
    // Opens external URL; Reddit will show a confirmation dialog for external URLs
    navigateTo('https://www.reddit.com/r/PakGameDev/comments/1q4e6jj/');
  };

  return (
    <div className="club banner">
      <div className="jam-overlay">
        <h1 className="jam-title">Game Dev Club</h1>
        <button className="primary-cta" onClick={handleJoinClick}>
          Join Now
        </button>
      </div>
    </div>
  );
};

const PakistanGameAwards: React.FC = () => {
  const handleJuryClick = () => {
    navigateTo('https://www.reddit.com/r/PakGameDev/comments/1ps0d73/');
  };

  const handleCouncilClick = () => {
    navigateTo('https://www.reddit.com/r/PakGameDev/comments/1przxdg/');
  };

  return (
    <div className="awards-grid">
      <button className="awards-card jury" onClick={handleJuryClick}>
        <span className="awards-label">Join The Jury</span>
      </button>
      <button className="awards-card council" onClick={handleCouncilClick}>
        <span className="awards-label">Join the Gamers&apos; Council</span>
      </button>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}