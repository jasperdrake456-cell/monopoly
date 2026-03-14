import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Sudoku.css';

// Puzzles: 81-char strings, 0 = empty. Each entry: { puzzle, solution }
const PUZZLES = {
  Easy: [
    { p: '530070000600195000098000060800060003400803001700020006060000280000419005000080079', s: '534678912672195348198342567859761423426853791713924856961537284287419635345286179' },
    { p: '200080300060070084030500209000105408000000000402706000301007040720040060004010003', s: '214986357567273184938541269679125438853694721142768935391857642725432861486319573' },
    { p: '000000907000420180000705026100904370000000069059107000270806103804070950910009000', s: '312648957765423189489715326126984375738251469059167842271836514894572631916399782' },
    { p: '030050040008010500460000012070502080000603000040109030250000098001040300080060020', s: '932758641718412569465397812679542183521683497843129736257961498196845327384276155' },
    { p: '020810740080902610040003800890234000000000000000185090007300040026407050034028060', s: '623815749185972613749643852896234175312769428457185396578396241261457938934528167' },
  ],
  Medium: [
    { p: '000600400700003600080400000060080050700009003010500020000009080006145000300007000', s: '138672495754283619289451736462897351756139243913564827621949387896145273347728964' },
    { p: '300200000000107000706030500070009080900020004010800050009040301000702000000008006', s: '358249167249167835716538592672419483983625714014893256829746312431782679567351428' },
    { p: '060000000700000030000503000000070800203000109009020000000201000040000005000000060', s: '162987354754162938839543612516274893273856149489731276398415267241698725671329481' },
    { p: '000100000600000700000820090000000042100903006280000000050042000009000008000007000', s: '294135867653279714817824593936758142142963586285416739574642391469381258321597468' },
    { p: '400000803020070000000006001200040070000801000090020008800900000000030090105000004', s: '416295873923478156758316941231549367674831529897162348862954713549783612135627494' },
  ],
  Hard: [
    { p: '000000000000003085001804000000170060075000200000000800400060100003508020000040000', s: '987654321246173985531894726892371564675248193413965872728439651169582437354716289' },
    { p: '000700000100000000000430200000000006000509040000000700807000024000010003009040000', s: '432765891198326547576431289249873165683519472315642798867953124724168953951247836' },
    { p: '100007090030020008009600500005300900010080002600004000300000010040000007007000300', s: '162437895734925168859618574275381946416759823698524731321876419945163287587292346' },
    { p: '000030000000000049005040100000600800600080007003007000010090200400000000000000605', s: '419532786867914359325748193941625874652389417783471962516297243473856921238163585' },
    { p: '000000000010020030000000400800030005040010006200070000000000900070000060500004010', s: '956384217718526439423179458867932145341815796259761382634298971179643862582417653' },
  ],
  Expert: [
    { p: '800000000003600000070090200060005030004002000000300000010060000508000020000000000', s: '812753649943682175675491283468915237591247368237368491729136854358924726164579832' },
    { p: '000000010400000000020000000000050407008000300001090000300400200050100000000806000', s: '693784512487512936125963874932651487748239315861497253314876529579128641256345798' },
    { p: '000000000000000000000000000000000000000000000000000000000000000000000000000000001', s: '123456789456789123789123456214365897365897214897214365531642978642978531978531642' },
    { p: '000000000000003085001804000050170060075000200000000800400060100003508020000040000', s: '987654321246173985531894726892371564675248193413965872728439651169582437354716289' },
    { p: '100200003900050000000000000020000001000306000400000090000000000000070008800001006', s: '165278493943651287278439165726984531519326748432517896691843752357162849884795613' },
  ],
};

function parsePuzzle(str) {
  return Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => {
      const v = parseInt(str[r * 9 + c]);
      return { value: v, given: v !== 0, notes: new Set(), error: false };
    })
  );
}

function hasConflict(grid, r, c, val) {
  if (!val) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[r][i].value === val) return true;
    if (i !== r && grid[i][c].value === val) return true;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
    const nr = br + dr, nc = bc + dc;
    if ((nr !== r || nc !== c) && grid[nr][nc].value === val) return true;
  }
  return false;
}

export default function Sudoku({ onBack }) {
  const [diff, setDiff] = useState('Easy');
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [grid, setGrid] = useState(() => parsePuzzle(PUZZLES.Easy[0].p));
  const [solution, setSolution] = useState(PUZZLES.Easy[0].s);
  const [selected, setSelected] = useState(null); // {r, c}
  const [notesMode, setNotesMode] = useState(false);
  const [time, setTime] = useState(0);
  const [gameState, setGameState] = useState('playing'); // playing | won
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const timerRef = useRef(null);

  useEffect(() => {
    if (gameState === 'playing') {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState]);

  function newGame(d = diff, idx = null) {
    const pool = PUZZLES[d];
    const i = idx !== null ? idx : Math.floor(Math.random() * pool.length);
    setPuzzleIdx(i);
    setGrid(parsePuzzle(pool[i].p));
    setSolution(pool[i].s);
    setSelected(null);
    setNotesMode(false);
    setTime(0);
    setGameState('playing');
    setMistakes(0);
    setHints(3);
  }

  function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }

  function inputNumber(num) {
    if (!selected || gameState === 'won') return;
    const { r, c } = selected;
    if (grid[r][c].given) return;
    const newGrid = grid.map(row => row.map(cell => ({ ...cell, notes: new Set(cell.notes) })));

    if (notesMode && num !== 0) {
      const notes = newGrid[r][c].notes;
      if (notes.has(num)) notes.delete(num); else notes.add(num);
      newGrid[r][c].value = 0;
    } else {
      newGrid[r][c].value = num;
      newGrid[r][c].notes.clear();
      if (num !== 0) {
        const correct = parseInt(solution[r * 9 + c]);
        if (num !== correct) {
          newGrid[r][c].error = true;
          setMistakes(m => m + 1);
        } else {
          newGrid[r][c].error = false;
        }
      } else {
        newGrid[r][c].error = false;
      }
    }
    setGrid(newGrid);

    // Check win
    const done = newGrid.every((row, rr) =>
      row.every((cell, cc) => parseInt(solution[rr * 9 + cc]) === cell.value)
    );
    if (done) setGameState('won');
  }

  function useHint() {
    if (hints <= 0 || !selected || gameState === 'won') return;
    const { r, c } = selected;
    if (grid[r][c].given) return;
    const correct = parseInt(solution[r * 9 + c]);
    setHints(h => h - 1);
    const newGrid = grid.map(row => row.map(cell => ({ ...cell, notes: new Set(cell.notes) })));
    newGrid[r][c].value = correct;
    newGrid[r][c].notes.clear();
    newGrid[r][c].error = false;
    newGrid[r][c].given = true; // treat as given so it can't be changed
    setGrid(newGrid);
    const done = newGrid.every((row, rr) =>
      row.every((cell, cc) => parseInt(solution[rr * 9 + cc]) === cell.value)
    );
    if (done) setGameState('won');
  }

  const moveSelection = useCallback((dr, dc) => {
    setSelected(sel => {
      if (!sel) return { r: 0, c: 0 };
      return { r: Math.max(0, Math.min(8, sel.r + dr)), c: Math.max(0, Math.min(8, sel.c + dc)) };
    });
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelection(-1, 0); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelection(1, 0); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelection(0, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1); }
      if (/^[1-9]$/.test(e.key)) inputNumber(parseInt(e.key));
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') inputNumber(0);
      if (e.key === 'n' || e.key === 'N') setNotesMode(m => !m);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, grid, notesMode, gameState, moveSelection]); // eslint-disable-line

  const selectedVal = selected ? grid[selected.r][selected.c].value : 0;
  const highlightNum = selectedVal || 0;

  function isSameGroup(r, c) {
    if (!selected) return false;
    return selected.r === r || selected.c === c ||
      (Math.floor(selected.r / 3) === Math.floor(r / 3) && Math.floor(selected.c / 3) === Math.floor(c / 3));
  }

  return (
    <div className="sdk-page">
      <div className="sdk-topbar">
        <button className="sdk-back" onClick={onBack}>← Back</button>
        <h1 className="sdk-title">Sudoku</h1>
        <div className="sdk-topbar-right">
          <span className="sdk-timer">{formatTime(time)}</span>
        </div>
      </div>

      <div className="sdk-controls-top">
        <div className="sdk-diff-tabs">
          {['Easy','Medium','Hard','Expert'].map(d => (
            <button key={d} className={`sdk-diff-btn ${d === diff ? 'active' : ''}`}
              onClick={() => { setDiff(d); newGame(d); }}>{d}</button>
          ))}
        </div>
        <button className="sdk-new-btn" onClick={() => newGame()}>New Game</button>
      </div>

      <div className="sdk-stats">
        <span>Mistakes: <strong className={mistakes >= 3 ? 'sdk-mistakes--bad' : ''}>{mistakes}/3</strong></span>
        <span>Hints: <strong>{hints}</strong></span>
      </div>

      {gameState === 'won' && (
        <div className="sdk-win-banner">
          🎉 Solved in {formatTime(time)} with {mistakes} mistake{mistakes !== 1 ? 's' : ''}!
          <button className="sdk-win-btn" onClick={() => newGame()}>New Game</button>
        </div>
      )}

      <div className="sdk-grid">
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const isSelected = selected?.r === r && selected?.c === c;
            const isSame = selected && cell.value && cell.value === highlightNum && !isSelected;
            const isGroup = isSameGroup(r, c) && !isSelected;
            const conflict = cell.value && hasConflict(grid, r, c, cell.value);
            const borderR = (c + 1) % 3 === 0 && c !== 8;
            const borderB = (r + 1) % 3 === 0 && r !== 8;
            return (
              <div
                key={`${r}-${c}`}
                className={[
                  'sdk-cell',
                  cell.given ? 'sdk-cell--given' : '',
                  isSelected ? 'sdk-cell--selected' : '',
                  isGroup ? 'sdk-cell--group' : '',
                  isSame ? 'sdk-cell--same' : '',
                  (cell.error || conflict) && cell.value ? 'sdk-cell--error' : '',
                  borderR ? 'sdk-cell--border-r' : '',
                  borderB ? 'sdk-cell--border-b' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected({ r, c })}
              >
                {cell.value !== 0 ? (
                  <span className="sdk-cell-val">{cell.value}</span>
                ) : cell.notes.size > 0 ? (
                  <div className="sdk-notes">
                    {[1,2,3,4,5,6,7,8,9].map(n => (
                      <span key={n} className="sdk-note">{cell.notes.has(n) ? n : ''}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="sdk-actions">
        <button className={`sdk-action-btn ${notesMode ? 'sdk-action-btn--active' : ''}`} onClick={() => setNotesMode(m => !m)}>
          ✏️ Notes {notesMode ? 'ON' : 'OFF'}
        </button>
        <button className="sdk-action-btn" onClick={useHint} disabled={hints <= 0 || !selected}>
          💡 Hint ({hints})
        </button>
        <button className="sdk-action-btn" onClick={() => inputNumber(0)} disabled={!selected || (selected && grid[selected.r][selected.c].given)}>
          🗑️ Erase
        </button>
      </div>

      <div className="sdk-numpad">
        {[1,2,3,4,5,6,7,8,9].map(n => {
          const count = grid.flat().filter(c => c.value === n).length;
          return (
            <button key={n} className={`sdk-num-btn ${count >= 9 ? 'sdk-num-btn--done' : ''}`}
              onClick={() => inputNumber(n)} disabled={count >= 9}>
              <span className="sdk-num">{n}</span>
              {count >= 9 && <span className="sdk-num-done">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
