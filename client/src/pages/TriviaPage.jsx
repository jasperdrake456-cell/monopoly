import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './TriviaPage.css';

const QUESTIONS = [
  { q: 'Which movie won Best Picture at the 2024 Oscars?', answers: ['Oppenheimer', 'Poor Things', 'The Zone of Interest', 'American Fiction'], correct: 0 },
  { q: 'Taylor Swift\'s "Eras Tour" broke the record for the highest-grossing concert tour of all time. What was the previous record holder?', answers: ['Elton John', 'The Rolling Stones', 'Ed Sheeran', 'BTS'], correct: 0 },
  { q: 'What TV show features characters living in the fictional town of Hawkins, Indiana?', answers: ['Stranger Things', 'The Walking Dead', 'Yellowstone', 'Dark'], correct: 0 },
  { q: 'Who plays Tony Stark / Iron Man in the Marvel Cinematic Universe?', answers: ['Robert Downey Jr.', 'Chris Evans', 'Chris Hemsworth', 'Mark Ruffalo'], correct: 0 },
  { q: 'Which artist released the album "Renaissance" in 2022?', answers: ['Beyoncé', 'Rihanna', 'Adele', 'Lizzo'], correct: 0 },
  { q: 'In "The Last of Us" HBO series, who plays Joel Miller?', answers: ['Pedro Pascal', 'Oscar Isaac', 'Jon Hamm', 'Nikolaj Coster-Waldau'], correct: 0 },
  { q: 'What is the name of the coffee shop in "Friends"?', answers: ['Central Perk', 'The Grind', 'Java Joe\'s', 'Perks'], correct: 0 },
  { q: 'Which film franchise includes the movies "Minions" and "Despicable Me"?', answers: ['Illumination', 'DreamWorks', 'Pixar', 'Blue Sky'], correct: 0 },
  { q: 'Cardi B and Megan Thee Stallion collaborated on which viral 2020 hit?', answers: ['WAP', 'Savage', 'Up', 'Bodak Yellow'], correct: 0 },
  { q: 'Who directed the movie "Get Out" (2017)?', answers: ['Jordan Peele', 'Ryan Coogler', 'Ava DuVernay', 'Barry Jenkins'], correct: 0 },
  { q: 'Which Netflix series is set in a women\'s prison and based on a memoir by Piper Kerman?', answers: ['Orange Is the New Black', 'Wentworth', 'Ozark', 'Unbelievable'], correct: 0 },
  { q: 'What sport does Simone Biles compete in?', answers: ['Gymnastics', 'Swimming', 'Track & Field', 'Diving'], correct: 0 },
  { q: 'Which rapper\'s real name is Aubrey Drake Graham?', answers: ['Drake', 'Kendrick Lamar', 'J. Cole', 'Travis Scott'], correct: 0 },
  { q: 'In "Game of Thrones," what is the name of Jon Snow\'s direwolf?', answers: ['Ghost', 'Lady', 'Nymeria', 'Grey Wind'], correct: 0 },
  { q: 'Who played Black Panther in the 2018 Marvel film?', answers: ['Chadwick Boseman', 'Michael B. Jordan', 'Lupita Nyong\'o', 'Winston Duke'], correct: 0 },
  { q: 'Billie Eilish became the youngest artist to win all four main Grammy categories. How old was she?', answers: ['18', '16', '20', '22'], correct: 0 },
  { q: 'Which show features the Dutton family and their ranch in Montana?', answers: ['Yellowstone', '1883', 'Longmire', 'Outer Range'], correct: 0 },
  { q: 'What is the name of the wizarding school in the Harry Potter series?', answers: ['Hogwarts', 'Beauxbatons', 'Durmstrang', 'Ilvermorny'], correct: 0 },
  { q: 'Lizzo\'s breakout hit "Truth Hurts" samples which artist?', answers: ['Mina Lioness', 'Ariana Grande', 'Alicia Keys', 'H.E.R.'], correct: 0 },
  { q: 'Which MCU film was the first to gross over $1 billion at the box office?', answers: ['The Avengers', 'Iron Man', 'Thor', 'Captain America: The First Avenger'], correct: 0 },
  { q: 'What is the name of Ariana Grande\'s famous ponytail-era fragrance line?', answers: ['Cloud', 'Thank U Next', 'God is a Woman', 'Break Free'], correct: 0 },
  { q: 'In "Breaking Bad," what is Walter White\'s teacher alias when cooking meth?', answers: ['Heisenberg', 'The Cook', 'Mr. White', 'Blue Sky'], correct: 0 },
  { q: 'Which animated film features the song "Into the Unknown"?', answers: ['Frozen II', 'Moana', 'Encanto', 'Frozen'], correct: 0 },
  { q: 'Who is the creator of "The Office" (US version)?', answers: ['Greg Daniels', 'Ricky Gervais', 'Steve Carell', 'Michael Schur'], correct: 0 },
  { q: 'What city does the TV show "Euphoria" take place in?', answers: ['Los Angeles', 'New York', 'Miami', 'Chicago'], correct: 0 },
  { q: 'Which singer is known as "Queen Bey"?', answers: ['Beyoncé', 'Rihanna', 'Nicki Minaj', 'Mariah Carey'], correct: 0 },
  { q: 'Who plays Eleven in "Stranger Things"?', answers: ['Millie Bobby Brown', 'Sadie Sink', 'Natalia Dyer', 'Maya Hawke'], correct: 0 },
  { q: 'What is the name of the fictional island nation in "Black Panther"?', answers: ['Wakanda', 'Genosha', 'Latveria', 'Madripoor'], correct: 0 },
  { q: 'Which K-pop group has members RM, Jin, Suga, J-Hope, Jimin, V, and Jungkook?', answers: ['BTS', 'BLACKPINK', 'EXO', 'TWICE'], correct: 0 },
  { q: 'In "The Mandalorian," what is the nickname fans gave to the baby alien character?', answers: ['Baby Yoda', 'Grogu', 'Little One', 'The Asset'], correct: 0 },
  { q: 'Who directed "Spider-Man: Into the Spider-Verse"?', answers: ['Bob Persichetti & Peter Ramsey', 'Jon Watts', 'Sam Raimi', 'Marc Webb'], correct: 0 },
  { q: 'Which song by Olivia Rodrigo was her debut single in 2021?', answers: ['drivers license', 'good 4 u', 'deja vu', 'brutal'], correct: 0 },
  { q: 'What streaming platform is "House of Cards" originally from?', answers: ['Netflix', 'HBO', 'Amazon Prime', 'Hulu'], correct: 0 },
  { q: 'In "Avengers: Infinity War," how many Infinity Stones does Thanos need?', answers: ['6', '5', '4', '7'], correct: 0 },
  { q: 'Which rapper released the album "DAMN." in 2017, winning a Pulitzer Prize?', answers: ['Kendrick Lamar', 'J. Cole', 'Drake', 'Jay-Z'], correct: 0 },
  { q: 'What is the name of the reality show where contestants compete for $1 million by surviving in the wild?', answers: ['Survivor', 'The Amazing Race', 'Fear Factor', 'Naked and Afraid'], correct: 0 },
  { q: 'Who plays the Joker in the 2019 film "Joker"?', answers: ['Joaquin Phoenix', 'Jared Leto', 'Heath Ledger', 'Jack Nicholson'], correct: 0 },
  { q: 'Which Adele album contains the hit song "Hello"?', answers: ['25', '21', '30', '19'], correct: 0 },
  { q: 'What fictional country is Wonder Woman from?', answers: ['Themyscira', 'Atlantis', 'Krypton', 'Asgard'], correct: 0 },
  { q: 'Which TV show popularized the phrase "Winter is Coming"?', answers: ['Game of Thrones', 'The Walking Dead', 'Vikings', 'The Witcher'], correct: 0 },
  { q: 'Harry Styles\' debut solo single was which song?', answers: ['Sign of the Times', 'Watermelon Sugar', 'Adore You', 'Lights Up'], correct: 0 },
  { q: 'What is the name of the fictional universe in "Succession"?', answers: ['Waystar Royco', 'Pearce Media', 'Logan Corp', 'Roy Empire'], correct: 0 },
  { q: 'Which animated Disney film features the character Moana?', answers: ['Moana', 'Polynesia', 'Ocean', 'Vaiana'], correct: 0 },
  { q: 'Who won the FIFA World Cup in 2022?', answers: ['Argentina', 'France', 'Brazil', 'Germany'], correct: 0 },
  { q: 'What is the name of the streaming service launched by Disney in 2019?', answers: ['Disney+', 'DisneyNow', 'Disney Stream', 'Magic+'], correct: 0 },
  { q: 'Which actress plays Katniss Everdeen in "The Hunger Games"?', answers: ['Jennifer Lawrence', 'Emma Stone', 'Shailene Woodley', 'Kristen Stewart'], correct: 0 },
  { q: 'The song "Old Town Road" by Lil Nas X broke the record for most weeks at #1 on the Billboard Hot 100. How many weeks?', answers: ['19', '16', '12', '22'], correct: 0 },
  { q: 'In "The Witcher," what is Geralt\'s nickname based on his white hair?', answers: ['The White Wolf', 'The Silver Fox', 'Witcher of Rivia', 'The Pale One'], correct: 0 },
  { q: 'Which film series features Dominic Toretto and Brian O\'Conner?', answers: ['Fast & Furious', 'Mission: Impossible', 'Die Hard', 'Bad Boys'], correct: 0 },
  { q: 'What app made "TikTok" famous before rebranding?', answers: ['Musical.ly', 'Vine', 'Dubsmash', 'Triller'], correct: 0 },
  { q: 'Who plays Daenerys Targaryen in "Game of Thrones"?', answers: ['Emilia Clarke', 'Kit Harington', 'Sophie Turner', 'Maisie Williams'], correct: 0 },
  { q: 'Which Pixar film features the character Miguel Rivera and takes place during Día de los Muertos?', answers: ['Coco', 'Soul', 'Luca', 'Turning Red'], correct: 0 },
  { q: 'What country does the band Coldplay originate from?', answers: ['United Kingdom', 'United States', 'Australia', 'Ireland'], correct: 0 },
  { q: 'Who hosts "The Daily Show" and joined in 2022?', answers: ['Trevor Noah', 'Jon Stewart', 'John Oliver', 'Hasan Minhaj'], correct: 0 },
  { q: 'In "Squid Game," what shape is on the costume of the Front Man\'s guards?', answers: ['Circle, Triangle, Square', 'Star, Moon, Sun', 'Diamond, Heart, Club', 'X, O, Triangle'], correct: 0 },
  { q: 'Which superhero movie was the first to win a Best Picture Oscar nomination?', answers: ['Black Panther', 'The Dark Knight', 'Logan', 'Avengers: Endgame'], correct: 0 },
  { q: 'What is the real name of Cardi B?', answers: ['Belcalis Almanzar', 'Nicki Minaj', 'Katrina Taylor', 'Robyn Fenty'], correct: 0 },
  { q: 'Which show follows a chemistry teacher who becomes a drug lord in Albuquerque?', answers: ['Breaking Bad', 'Ozark', 'Better Call Saul', 'Narcos'], correct: 0 },
  { q: 'What is the highest-grossing animated film of all time?', answers: ['The Lion King (2019)', 'Frozen II', 'Finding Dory', 'Incredibles 2'], correct: 0 },
  { q: 'Which artist\'s Super Bowl halftime show in 2023 featured a tribute to Afrobeats?', answers: ['Rihanna', 'Beyoncé', 'Shakira', 'Bad Bunny'], correct: 0 },
  { q: 'In "Friends," what are the names of Ross\'s two ex-wives?', answers: ['Carol and Emily', 'Rachel and Julie', 'Monica and Janice', 'Elizabeth and Mona'], correct: 0 },
  { q: 'Which Netflix documentary series examines the story of Tiger King Joe Exotic?', answers: ['Tiger King', 'The Keepers', 'Don\'t F**k with Cats', 'Wild Wild Country'], correct: 0 },
  { q: 'Who sang "Bad Guy" which topped charts worldwide in 2019?', answers: ['Billie Eilish', 'Halsey', 'Lorde', 'Lana Del Rey'], correct: 0 },
  { q: 'What is the name of Thor\'s hammer in Norse mythology and Marvel?', answers: ['Mjolnir', 'Gungnir', 'Stormbreaker', 'Hofund'], correct: 0 },
  { q: 'Which show is set in the fictional Pawnee, Indiana government office?', answers: ['Parks and Recreation', 'The Office', 'Brooklyn Nine-Nine', 'Abbott Elementary'], correct: 0 },
  { q: 'In what year did Instagram launch?', answers: ['2010', '2008', '2012', '2009'], correct: 0 },
  { q: 'Which actress plays Meredith Grey in "Grey\'s Anatomy"?', answers: ['Ellen Pompeo', 'Sandra Oh', 'Chandra Wilson', 'Caterina Scorsone'], correct: 0 },
  { q: 'What song did Pharrell Williams produce for the 2013 film "Despicable Me 2"?', answers: ['Happy', 'Get Lucky', 'Blurred Lines', 'Come Get It Bae'], correct: 0 },
  { q: 'Which Marvel character wields an axe called Stormbreaker?', answers: ['Thor', 'Captain America', 'Iron Man', 'Vision'], correct: 0 },
  { q: 'Who played Elvis Presley in the 2022 Baz Luhrmann biopic?', answers: ['Austin Butler', 'Timothée Chalamet', 'Zac Efron', 'Ansel Elgort'], correct: 0 },
  { q: 'What is the name of the island where "Lost" takes place?', answers: ['The Island', 'Purgatory Island', 'Oceanic Island', 'Station 4'], correct: 0 },
  { q: 'Which award show gives out the "Golden Globes"?', answers: ['Hollywood Foreign Press Association', 'Academy of Motion Picture Arts', 'Screen Actors Guild', 'Television Academy'], correct: 0 },
  { q: 'Dua Lipa\'s "Future Nostalgia" album was released in what year?', answers: ['2020', '2019', '2021', '2018'], correct: 0 },
  { q: 'In "The Crown," who plays Queen Elizabeth II in the earlier seasons?', answers: ['Claire Foy', 'Olivia Colman', 'Imelda Staunton', 'Helena Bonham Carter'], correct: 0 },
  { q: 'Which city hosted the 2024 Summer Olympics?', answers: ['Paris', 'Los Angeles', 'Tokyo', 'London'], correct: 0 },
  { q: 'What is the name of the fictional tech company in "Silicon Valley" on HBO?', answers: ['Pied Piper', 'Hooli', 'Nucleus', 'Raviga'], correct: 0 },
  { q: 'Who plays Shazam in the 2019 DC film?', answers: ['Zachary Levi', 'Dwayne Johnson', 'John Cena', 'Asher Angel'], correct: 0 },
  { q: 'Which song by The Weeknd was the best-selling single of 2020?', answers: ['Blinding Lights', 'Heartless', 'In Your Eyes', 'Save Your Tears'], correct: 0 },
  { q: 'What Netflix series follows a group of friends who solve mysteries in the Outer Banks of North Carolina?', answers: ['Outer Banks', 'Ozark', 'On My Block', 'All American'], correct: 0 },
  { q: 'Who voices Buzz Lightyear in the "Toy Story" films?', answers: ['Tim Allen', 'Tom Hanks', 'Chris Evans', 'John Goodman'], correct: 0 },
  { q: 'Which pop star is known as "Mother Monster"?', answers: ['Lady Gaga', 'Madonna', 'Katy Perry', 'Nicki Minaj'], correct: 0 },
  { q: 'In "Bridgerton," what is the name of the mysterious gossip columnist?', answers: ['Lady Whistledown', 'Lady Danbury', 'Lady Featherington', 'Queen Charlotte'], correct: 0 },
  { q: 'What Marvel film introduced the concept of the multiverse to the MCU?', answers: ['Doctor Strange', 'Avengers: Endgame', 'Spider-Man: Far From Home', 'Loki'], correct: 0 },
  { q: 'Which reality TV show made Kim Kardashian famous?', answers: ['Keeping Up with the Kardashians', 'The Simple Life', 'Real Housewives', 'America\'s Next Top Model'], correct: 0 },
  { q: 'What is the name of the high school in "Stranger Things"?', answers: ['Hawkins High', 'Hawkins Middle', 'Starcourt High', 'Indiana High'], correct: 0 },
  { q: 'Who directed "Parasite," the first non-English film to win Best Picture?', answers: ['Bong Joon-ho', 'Park Chan-wook', 'Lee Chang-dong', 'Kim Jee-woon'], correct: 0 },
  { q: 'Which artist released "Anti" in 2016?', answers: ['Rihanna', 'Beyoncé', 'Adele', 'Nicki Minaj'], correct: 0 },
  { q: 'In "The Office," what company do the characters work for?', answers: ['Dunder Mifflin', 'Sabre', 'Michael Scott Paper Company', 'Vance Refrigeration'], correct: 0 },
  { q: 'What is the name of the student in "Cobra Kai" who was bullied by Johnny Lawrence in "The Karate Kid"?', answers: ['Daniel LaRusso', 'Miguel Diaz', 'Eli Moskowitz', 'Demetri'], correct: 0 },
  { q: 'Which 2023 film starred Margot Robbie and Ryan Gosling as iconic toy characters?', answers: ['Barbie', 'Ken', 'Toy Story 5', 'Plastic Fantastic'], correct: 0 },
  { q: 'What genre of music is Bad Bunny known for?', answers: ['Reggaeton / Latin trap', 'Hip-hop', 'R&B', 'Pop'], correct: 0 },
  { q: 'In "Euphoria," who plays Rue Bennett?', answers: ['Zendaya', 'Sydney Sweeney', 'Hunter Schafer', 'Maude Apatow'], correct: 0 },
];

// Shuffle the answers for each question so correct isn't always first
function prepareQuestions(pool) {
  return pool.map(({ q, answers, correct }) => {
    const correctAnswer = answers[correct];
    const shuffled = [...answers].sort(() => Math.random() - 0.5);
    return {
      q,
      answers: shuffled,
      correct: shuffled.indexOf(correctAnswer),
    };
  });
}

function getTodaysDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function TriviaPage() {
  const [questions] = useState(() => {
    const dayIndex = Math.floor(Date.now() / 86400000);
    const start = (dayIndex * 3) % QUESTIONS.length;
    const pool = [0, 1, 2].map(i => QUESTIONS[(start + i) % QUESTIONS.length]);
    return prepareQuestions(pool);
  });

  const today = getTodaysDate();
  const savedDate = localStorage.getItem('trivia_date');
  const alreadyDone = savedDate === today;
  const savedScore = alreadyDone ? parseInt(localStorage.getItem('trivia_score') || '0') : null;

  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(alreadyDone);
  const [finalScore, setFinalScore] = useState(savedScore);
  const scoreRef = React.useRef(0);

  function handleAnswer(i) {
    if (selected !== null) return;
    setSelected(i);
    if (i === questions[qIndex].correct) {
      scoreRef.current += 1;
    }
  }

  function handleNext() {
    if (qIndex < 2) {
      setQIndex(q => q + 1);
      setSelected(null);
    } else {
      const s = scoreRef.current;
      localStorage.setItem('trivia_date', today);
      localStorage.setItem('trivia_score', String(s));
      setFinalScore(s);
      setDone(true);
    }
  }

  function getScoreMessage(s) {
    if (s === 3) return '3 / 3 — Perfect! 🏆';
    if (s === 2) return '2 / 3 — Nice! 🎉';
    if (s === 1) return '1 / 3 — Keep trying! 💪';
    return '0 / 3 — Better luck tomorrow! 😅';
  }

  const q = questions[qIndex];

  return (
    <div className="trivia">
      <div className="trivia-container">
        <div className="trivia-header">
          <Link to="/" className="trivia-back">← Hub</Link>
          <div className="trivia-title">🎯 Daily Trivia</div>
          <div className="trivia-date">{today}</div>
        </div>

        {done ? (
          <div className="trivia-done">
            <div className="trivia-done-score">{getScoreMessage(finalScore)}</div>
            <p className="trivia-done-sub">Come back tomorrow for 3 new questions!</p>
            <Link to="/" className="trivia-hub-btn">Back to Hub</Link>
          </div>
        ) : (
          <div className="trivia-body">
            <div className="trivia-progress">
              {[0, 1, 2].map(i => (
                <div key={i} className={`trivia-pip ${i < qIndex ? 'done' : i === qIndex ? 'active' : ''}`} />
              ))}
              <span className="trivia-progress-label">Question {qIndex + 1} of 3</span>
            </div>

            <div className="trivia-question">{q.q}</div>

            <div className="trivia-answers">
              {q.answers.map((a, i) => {
                let cls = 'trivia-answer';
                if (selected !== null) {
                  if (i === q.correct) cls += ' correct';
                  else if (i === selected) cls += ' wrong';
                  else cls += ' dimmed';
                }
                return (
                  <button key={i} className={cls} onClick={() => handleAnswer(i)}>
                    {a}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <button className="trivia-next" onClick={handleNext}>
                {qIndex < 2 ? 'Next →' : 'See Results'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
