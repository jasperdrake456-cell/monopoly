import React, { useState, useEffect, useCallback } from 'react';
import './Wordle.css';

const WORDS = [
  'ABOUT','ABOVE','ABUSE','ACTOR','ACUTE','ADMIT','ADULT','AFTER','AGAIN','AGENT',
  'AGREE','AHEAD','ALARM','ALBUM','ALERT','ALIKE','ALIVE','ALLEY','ALLOW','ALONE',
  'ALONG','ALTER','ANGEL','ANGER','ANGLE','ANGRY','APART','APPLE','APPLY','ARENA',
  'ARGUE','ARISE','ARMOR','ASIDE','ASSET','AUDIO','AUDIT','AVOID','AWARD','AWARE',
  'BADLY','BASIC','BATCH','BEACH','BEARD','BEGAN','BELOW','BENCH','BIBLE','BIRTH',
  'BLACK','BLADE','BLAME','BLANK','BLAZE','BLEED','BLEND','BLESS','BLINK','BLOCK',
  'BLOOD','BLOOM','BOARD','BOOST','BOUND','BRACE','BRAIN','BRAND','BRAVE','BREAD',
  'BREAK','BREED','BRICK','BRIDE','BRIEF','BRING','BROAD','BROKE','BROWN','BUILD',
  'BUILT','BURST','BUYER','CABLE','CARRY','CATCH','CAUSE','CHAIR','CHAOS','CHARM',
  'CHASE','CHECK','CHEEK','CHEER','CHESS','CHEST','CHILD','CHOSE','CHUNK','CIVIC',
  'CIVIL','CLAIM','CLASS','CLEAN','CLEAR','CLERK','CLICK','CLIFF','CLIMB','CLOSE',
  'CLOUD','CLOWN','COACH','COAST','COMIC','COUNT','COURT','COVER','CRAFT','CRANE',
  'CRASH','CRAZY','CREAM','CRIME','CROSS','CROWD','CROWN','CRUSH','CURVE','CYCLE',
  'DANCE','DEATH','DELAY','DENSE','DEPTH','DEVIL','DIRTY','DODGE','DOUBT','DRAFT',
  'DRAIN','DRAMA','DREAM','DRESS','DRIFT','DRINK','DRIVE','DRONE','DRUNK','EARLY',
  'EARTH','EIGHT','ELITE','EMPTY','ENEMY','ENJOY','ENTER','ENTRY','EQUAL','ESSAY',
  'EVADE','EVERY','EXACT','EXERT','EXIST','EXTRA','FAINT','FAIRY','FAITH','FANCY',
  'FATAL','FAULT','FEAST','FEVER','FIBER','FIELD','FIGHT','FINAL','FIRST','FIXED',
  'FLAKE','FLAME','FLARE','FLASH','FLICK','FLOOD','FLOOR','FLOUR','FLUID','FOCUS',
  'FORGE','FOUND','FRESH','FRONT','FROST','FUNNY','FURRY','GHOST','GIVEN','GLARE',
  'GLASS','GLEAM','GLIDE','GLOBE','GLOOM','GLOVE','GOOSE','GRACE','GRADE','GRAIN',
  'GRAPE','GRASS','GRAZE','GREED','GREET','GRIEF','GRIND','GROAN','GROVE','GROWL',
  'GROWN','GUARD','GUIDE','GUILT','HAPPY','HASTE','HEART','HEAVY','HEDGE','HENCE',
  'HINGE','HOBBY','HONEY','HONOR','HORSE','HOUSE','HOVER','HUMID','HUMOR','HURRY',
  'IDEAL','IMAGE','IMPLY','INFER','INNER','INPUT','ISSUE','JUICE','JUICY','JUMBO',
  'KNIFE','KNOCK','KNOWN','LABEL','LARGE','LASER','LATER','LAUGH','LAYER','LEASE',
  'LEDGE','LEGAL','LEMON','LEVEL','LIGHT','LIVER','LOCAL','LODGE','LOGIC','LOOSE',
  'LOVER','LOWER','LUCKY','MAGIC','MAJOR','MAKER','MANGO','MANOR','MARCH','MARSH',
  'MATCH','MAYOR','MEDIA','MERCY','MERGE','MERIT','METAL','MIGHT','MISER','MODEL',
  'MONEY','MONTH','MOODY','MORAL','MOUND','MOUNT','MOUTH','NERVE','NEVER','NIGHT',
  'NOBLE','NOISE','NOTCH','NOVEL','OCCUR','OFFER','OFTEN','OLIVE','ONSET','ORBIT',
  'ORDER','ORGAN','OUGHT','OWNED','OXIDE','OZONE','PAINT','PAPER','PARTY','PASTA',
  'PAUSE','PEACE','PEARL','PEDAL','PENNY','PERCH','PETAL','PHASE','PHONE','PHOTO',
  'PIANO','PIECE','PILOT','PITCH','PIXEL','PLACE','PLAIN','PLANE','PLANT','PLATE',
  'PLAZA','PLEAD','PLUMB','PLUME','POINT','POLAR','PORCH','POUCH','POUND','POWER',
  'PRESS','PRICE','PRIDE','PRIME','PRISM','PRIZE','PROBE','PROOF','PROSE','PROVE',
  'QUEEN','QUERY','QUICK','QUIET','QUOTA','QUOTE','RADIO','RAISE','RALLY','RANGE',
  'RAPID','REACH','READY','REBEL','RELAX','REPAY','REPLY','RIDER','RIDGE','RIFLE',
  'RIGHT','RIGID','RISKY','RIVAL','ROCKY','ROUGH','ROUND','ROUTE','ROYAL','RULER',
  'RUSTY','SAINT','SALAD','SAUCE','SCALE','SCARE','SCENE','SCENT','SCORE','SCOUT',
  'SEIZE','SENSE','SERVE','SHAFT','SHAME','SHAPE','SHARE','SHARP','SHEEP','SHEET',
  'SHELF','SHELL','SHIFT','SHINE','SHIRT','SHORT','SHOUT','SIGHT','SKILL','SKULL',
  'SLIDE','SLOPE','SMALL','SMART','SMELL','SMILE','SMOKE','SOLAR','SOLID','SOLVE',
  'SORRY','SOUND','SOUTH','SPACE','SPARE','SPARK','SPEAK','SPEED','SPEND','SPICE',
  'SPIKE','SPITE','SPLIT','SPOKE','SPOON','SPORT','SPRAY','STACK','STAIN','STAIR',
  'STAKE','STALE','STARE','STARK','START','STEAK','STEAL','STEEL','STERN','STICK',
  'STIFF','STILL','STINK','STOCK','STONE','STOOD','STORM','STORY','STOUT','STRAW',
  'STRAY','STRIP','STUCK','STUFF','STYLE','SUGAR','SUITE','SUPER','SURGE','SWAMP',
  'SWEAR','SWEET','SWIFT','SWING','SWORD','TABLE','TASTE','TEACH','TEETH','TENSE',
  'TIGER','TIGHT','TIMER','TITAN','TITLE','TOAST','TODAY','TOKEN','TOPIC','TOTAL',
  'TOUCH','TOUGH','TOWEL','TOWER','TOXIC','TRACK','TRADE','TRAIL','TRAIN','TRAIT',
  'TRASH','TREAT','TREND','TRIAL','TRIBE','TRICK','TRIED','TROOP','TRUCK','TRULY',
  'TRUNK','TRUST','TRUTH','TULIP','TWICE','TWIST','UNDER','UNITE','UNTIL','UPPER',
  'UPSET','VALOR','VALVE','VAPOR','VAULT','VIPER','VISIT','VISTA','VIVID','VOCAL',
  'VOICE','VOTER','WAGON','WAIST','WATCH','WATER','WEARY','WEDGE','WEIRD','WEIGH',
  'WHILE','WHIRL','WHOLE','WIELD','WITCH','WITTY','WORSE','WORST','WOULD','WOUND',
  'WRIST','WROTE','YACHT','YIELD','YOUNG','YOURS','YOUTH','ZEBRA','ZESTY','ZONED',
];

function getDailyWord() {
  const epoch = new Date('2024-01-01');
  const today = new Date();
  const day = Math.floor((today - epoch) / 86400000);
  return WORDS[day % WORDS.length];
}

function evaluateGuess(guess, target) {
  const result = Array(5).fill('absent');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
    } else {
      remaining[target[i]] = (remaining[target[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    if (remaining[guess[i]] > 0) {
      result[i] = 'present';
      remaining[guess[i]]--;
    }
  }
  return result;
}

const ROWS = 6;
const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

export default function Wordle({ onBack }) {
  const [target] = useState(getDailyWord);
  const [guesses, setGuesses] = useState([]); // [{letters:[{char,state}]}]
  const [input, setInput] = useState('');
  const [gameState, setGameState] = useState('playing'); // playing | won | lost
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState([]); // tracks which rows have been revealed (animated)
  const [freePlay, setFreePlay] = useState(false);

  // Build keyboard letter states from all guesses
  const letterStates = {};
  for (const g of guesses) {
    for (const { char, state } of g.letters) {
      const cur = letterStates[char];
      if (state === 'correct') letterStates[char] = 'correct';
      else if (state === 'present' && cur !== 'correct') letterStates[char] = 'present';
      else if (!cur || cur === 'unused') letterStates[char] = 'absent';
    }
  }

  function showMessage(msg, duration = 1500) {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  }

  const submitGuess = useCallback(() => {
    if (input.length < 5) { showMessage('Not enough letters'); setShake(true); setTimeout(() => setShake(false), 600); return; }
    const word = input.toUpperCase();
    const states = evaluateGuess(word, target);
    const letters = word.split('').map((char, i) => ({ char, state: states[i] }));
    const newGuesses = [...guesses, { letters }];
    setGuesses(newGuesses);
    setRevealed(r => [...r, newGuesses.length - 1]);
    setInput('');

    const won = states.every(s => s === 'correct');
    if (won) {
      setTimeout(() => { setGameState('won'); showMessage(['Genius!','Magnificent!','Impressive!','Splendid!','Great!','Phew!'][newGuesses.length - 1] || 'Nice!', 3000); }, 1800);
    } else if (newGuesses.length >= ROWS) {
      setTimeout(() => { setGameState('lost'); showMessage(target, 4000); }, 1800);
    }
  }, [input, guesses, target]);

  const pressKey = useCallback((key) => {
    if (gameState !== 'playing') return;
    if (key === 'ENTER') { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setInput(i => i.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && input.length < 5) setInput(i => i + key);
  }, [gameState, input, submitGuess]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Enter') pressKey('ENTER');
      else if (e.key === 'Backspace') pressKey('⌫');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toUpperCase());
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressKey]);

  function resetFreePlay() {
    const rand = WORDS[Math.floor(Math.random() * WORDS.length)];
    setGuesses([]);
    setInput('');
    setGameState('playing');
    setRevealed([]);
    setMessage('');
    setFreePlay(true);
    // We need a new target — use a trick with a key prop on the parent
    window.location.reload(); // Simple reset for free play
  }

  return (
    <div className="wordle-page">
      <div className="wordle-topbar">
        <button className="wordle-back" onClick={onBack}>← Back</button>
        <h1 className="wordle-title">Wordle</h1>
        <div className="wordle-topbar-right">
          <span className="wordle-date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {message && <div className="wordle-message">{message}</div>}

      <div className="wordle-board">
        {Array.from({ length: ROWS }, (_, row) => {
          const guess = guesses[row];
          const isActive = row === guesses.length && gameState === 'playing';
          const isRevealed = revealed.includes(row);
          return (
            <div key={row} className={`wordle-row ${isActive && shake ? 'wordle-shake' : ''}`}>
              {Array.from({ length: 5 }, (_, col) => {
                let char = '';
                let state = '';
                if (guess) { char = guess.letters[col].char; state = guess.letters[col].state; }
                else if (isActive) char = input[col] || '';
                const filled = !!char;
                return (
                  <div
                    key={col}
                    className={`wordle-tile ${filled && !guess ? 'wordle-tile--filled' : ''} ${state ? `wordle-tile--${state}` : ''} ${isRevealed ? 'wordle-tile--reveal' : ''}`}
                    style={isRevealed ? { animationDelay: `${col * 0.1}s` } : {}}
                  >
                    {char}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {(gameState === 'won' || gameState === 'lost') && (
        <div className="wordle-result">
          {gameState === 'won' ? (
            <span className="wordle-result-won">🎉 {guesses.length}/6</span>
          ) : (
            <span className="wordle-result-lost">The word was <strong>{target}</strong></span>
          )}
          <button className="wordle-replay-btn" onClick={() => window.location.reload()}>New Word</button>
        </div>
      )}

      <div className="wordle-keyboard">
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="wordle-kb-row">
            {row.map(key => (
              <button
                key={key}
                className={`wordle-key ${key.length > 1 ? 'wordle-key--wide' : ''} wordle-key--${letterStates[key] || 'unused'}`}
                onPointerDown={() => pressKey(key)}
              >{key}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
