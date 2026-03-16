import React, { useState, useEffect, useCallback, useRef } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore } from '../utils/leaderboard';
import './Wordle.css';

const ANSWERS = [
  'ABOUT','ABOVE','ABUSE','ACTOR','ACUTE','ADMIT','ADOPT','ADULT','AFTER','AGAIN',
  'AGENT','AGREE','AHEAD','ALARM','ALBUM','ALERT','ALIKE','ALIVE','ALLEY','ALLOW',
  'ALONE','ALONG','ALTER','ANGEL','ANGER','ANGLE','ANGRY','APART','APPLE','APPLY',
  'ARENA','ARGUE','ARISE','ARMOR','ASIDE','ASSET','AUDIO','AUDIT','AVOID','AWARD',
  'AWARE','BASIC','BATCH','BEACH','BEARD','BEGAN','BELOW','BENCH','BIRTH','BLACK',
  'BLADE','BLAME','BLANK','BLAZE','BLEED','BLEND','BLESS','BLINK','BLOCK','BLOOD',
  'BLOOM','BOARD','BOOST','BOUND','BRACE','BRAIN','BRAND','BRAVE','BREAD','BREAK',
  'BREED','BRICK','BRIDE','BRIEF','BRING','BROAD','BROKE','BROWN','BUILD','BUILT',
  'BURST','BUYER','CABLE','CARRY','CATCH','CAUSE','CHAIR','CHAOS','CHARM','CHASE',
  'CHECK','CHEEK','CHEER','CHESS','CHEST','CHILD','CHOSE','CHUNK','CIVIL','CLAIM',
  'CLASS','CLEAN','CLEAR','CLERK','CLICK','CLIFF','CLIMB','CLOSE','CLOUD','CLOWN',
  'COACH','COAST','COMIC','COUNT','COURT','COVER','CRAFT','CRANE','CRASH','CRAZY',
  'CREAM','CRIME','CROSS','CROWD','CROWN','CRUSH','CURVE','CYCLE','DANCE','DEATH',
  'DELAY','DENSE','DEPTH','DEVIL','DIRTY','DODGE','DOUBT','DRAFT','DRAIN','DRAMA',
  'DREAM','DRESS','DRIFT','DRINK','DRIVE','DRONE','DRUNK','EARLY','EARTH','EIGHT',
  'ELITE','EMPTY','ENEMY','ENJOY','ENTER','ENTRY','EQUAL','ESSAY','EVADE','EVERY',
  'EXACT','EXERT','EXIST','EXTRA','FAINT','FAIRY','FAITH','FANCY','FATAL','FAULT',
  'FEAST','FEVER','FIBER','FIELD','FIGHT','FINAL','FIRST','FIXED','FLAKE','FLAME',
  'FLARE','FLASH','FLICK','FLOOD','FLOOR','FLOUR','FLUID','FOCUS','FORGE','FOUND',
  'FRESH','FRONT','FROST','FUNNY','FURRY','GHOST','GIVEN','GLARE','GLASS','GLEAM',
  'GLIDE','GLOBE','GLOOM','GLOVE','GOOSE','GRACE','GRADE','GRAIN','GRAPE','GRASS',
  'GRAZE','GREED','GREET','GRIEF','GRIND','GROAN','GROVE','GROWL','GROWN','GUARD',
  'GUIDE','GUILT','HAPPY','HASTE','HEART','HEAVY','HEDGE','HENCE','HINGE','HOBBY',
  'HONEY','HONOR','HORSE','HOUSE','HOVER','HUMID','HUMOR','HURRY','IDEAL','IMAGE',
  'IMPLY','INFER','INNER','INPUT','ISSUE','JUICE','JUICY','JUMBO','KNIFE','KNOCK',
  'KNOWN','LABEL','LARGE','LASER','LATER','LAUGH','LAYER','LEASE','LEDGE','LEGAL',
  'LEMON','LEVEL','LIGHT','LIVER','LOCAL','LODGE','LOGIC','LOOSE','LOVER','LOWER',
  'LUCKY','MAGIC','MAJOR','MAKER','MANGO','MANOR','MARCH','MARSH','MATCH','MAYOR',
  'MEDIA','MERCY','MERGE','MERIT','METAL','MIGHT','MISER','MODEL','MONEY','MONTH',
  'MOODY','MORAL','MOUND','MOUNT','MOUTH','NERVE','NEVER','NIGHT','NOBLE','NOISE',
  'NOTCH','NOVEL','OCCUR','OFFER','OFTEN','OLIVE','ONSET','ORBIT','ORDER','ORGAN',
  'OUGHT','OWNED','OXIDE','OZONE','PAINT','PAPER','PARTY','PASTA','PAUSE','PEACE',
  'PEARL','PEDAL','PENNY','PERCH','PETAL','PHASE','PHONE','PHOTO','PIANO','PIECE',
  'PILOT','PITCH','PIXEL','PLACE','PLAIN','PLANE','PLANT','PLATE','PLAZA','PLEAD',
  'PLUMB','PLUME','POINT','POLAR','PORCH','POUCH','POUND','POWER','PRESS','PRICE',
  'PRIDE','PRIME','PRISM','PRIZE','PROBE','PROOF','PROSE','PROVE','QUEEN','QUERY',
  'QUICK','QUIET','QUOTA','QUOTE','RADIO','RAISE','RALLY','RANGE','RAPID','REACH',
  'READY','REBEL','RELAX','REPAY','REPLY','RIDER','RIDGE','RIFLE','RIGHT','RIGID',
  'RISKY','RIVAL','ROCKY','ROUGH','ROUND','ROUTE','ROYAL','RULER','RUSTY','SAINT',
  'SALAD','SAUCE','SCALE','SCARE','SCENE','SCENT','SCORE','SCOUT','SEIZE','SENSE',
  'SERVE','SHAFT','SHAME','SHAPE','SHARE','SHARP','SHEEP','SHEET','SHELF','SHELL',
  'SHIFT','SHINE','SHIRT','SHORT','SHOUT','SIGHT','SKILL','SKULL','SLIDE','SLOPE',
  'SMALL','SMART','SMELL','SMILE','SMOKE','SOLAR','SOLID','SOLVE','SORRY','SOUND',
  'SOUTH','SPACE','SPARE','SPARK','SPEAK','SPEED','SPEND','SPICE','SPIKE','SPITE',
  'SPLIT','SPOKE','SPOON','SPORT','SPRAY','STACK','STAIN','STAIR','STAKE','STALE',
  'STARE','STARK','START','STEAK','STEAL','STEEL','STERN','STICK','STIFF','STILL',
  'STINK','STOCK','STONE','STOOD','STORM','STORY','STOUT','STRAW','STRAY','STRIP',
  'STUCK','STUFF','STYLE','SUGAR','SUITE','SUPER','SURGE','SWAMP','SWEAR','SWEET',
  'SWIFT','SWING','SWORD','TABLE','TASTE','TEACH','TEETH','TENSE','TIGER','TIGHT',
  'TIMER','TITAN','TITLE','TOAST','TODAY','TOKEN','TOPIC','TOTAL','TOUCH','TOUGH',
  'TOWEL','TOWER','TOXIC','TRACK','TRADE','TRAIL','TRAIN','TRAIT','TRASH','TREAT',
  'TREND','TRIAL','TRIBE','TRICK','TRIED','TROOP','TRUCK','TRULY','TRUNK','TRUST',
  'TRUTH','TULIP','TWICE','TWIST','UNDER','UNITE','UNTIL','UPPER','UPSET','VALOR',
  'VALVE','VAPOR','VAULT','VIPER','VISIT','VISTA','VIVID','VOCAL','VOICE','VOTER',
  'WAGON','WAIST','WATCH','WATER','WEARY','WEDGE','WEIRD','WEIGH','WHILE','WHIRL',
  'WHOLE','WIELD','WITCH','WITTY','WORSE','WORST','WOULD','WOUND','WRIST','WROTE',
  'YACHT','YIELD','YOUNG','YOURS','YOUTH','ZEBRA','ZESTY','ZONED','ABBEY','ABBOT',
  'ABHOR','ABIDE','ABODE','ABORT','ACORN','ACRES','ADAGE','ADDER','ADEPT','ADOBE',
  'ADORE','AFFIX','AGILE','AGONY','ALGAE','ALIBI','ALLAY','ALLOT','ALOOF','ALOUD',
  'ALTAR','AMAZE','AMBER','AMBLE','AMEND','AMPLE','AMUSE','ANNEX','ANTIC','ANVIL',
  'APTLY','ARBOR','ARDOR','ARSON','ASCOT','ASHEN','ASPEN','ATONE','ATTIC','AUGUR',
  'AVERT','AZURE','BADGE','BANJO','BARON','BASTE','BATON','BAYOU','BEIGE','BELLE',
  'BERTH','BIOME','BIRCH','BLUFF','BLUNT','BLURB','BLURT','BOGGY','BOTCH','BOUGH',
  'BOXER','BRAID','BRASH','BRAWN','BRISK','BROIL','BROOD','BROTH','BUGLE','BULGE',
  'BULLY','BUMPY','BUSHY','CACTI','CAIRN','CAMEL','CAMEO','CANAL','CANNY','CANOE',
  'CARGO','CAROL','CEDAR','CHAFE','CHANT','CHASM','CHIDE','CHILI','CHIVE','CHORD',
  'CHORE','CIRCA','CLAMP','CLANG','CLANK','CLASH','CLASP','CLEAT','CLEFT','CLINK',
  'CLOAK','CLOCK','CLONE','CLOVE','COMET','COMMA','CONCH','CORAL','CRAMP','CRAVE',
  'CRAWL','CREAK','CRIMP','CRISP','CROAK','CROON','CRUMB','CRYPT','CUBIC','CURLY',
  'DAISY','DECOY','DEPOT','DERBY','DETER','DETOX','DINGO','DIRGE','DITCH','DITTY',
  'DIZZY','DOLLY','DOWDY','DROWN','DRUID','DRYER','DUCHY','DUNCE','DWARF','EASEL',
  'EERIE','EGRET','ELBOW','ELDER','ELEGY','ELIDE','ELOPE','EMBER','EMERY','ENVOY',
  'EPOCH','EPOXY','EVOKE','EXCEL','EXILE','EXPEL','EXTOL','FABLE','FACET','FAKER',
  'FARCE','FAUNA','FERAL','FERRY','FETCH','FIEND','FIERY','FJORD','FLAIL','FLAIR',
  'FLASK','FLORA','FLOSS','FLUNK','FLUTE','FOAMY','FOLIO','FOLLY','FORAY','FORTE',
  'FORUM','FRAIL','FRANK','FRAUD','FREAK','FRISK','FROTH','FROZE','GABLE','GAUZE',
  'GAVEL','GECKO','GENIE','GENRE','GIRLY','GIRTH','GIZMO','GLOAT','GLYPH','GNARL',
  'GNASH','GNOME','GODLY','GOLEM','GORGE','GOUGE','GOURD','GRAFT','GRAIL','GRIPE',
  'GRIST','GROUT','GRUEL','GRUFF','GUAVA','GUISE','GULCH','GULLY','GUMMY','GUSTO',
  'GYPSY','HABIT','HARDY','HATCH','HAVEN','HAVOC','HAZEL','HEIST','HELIX','HERBY',
  'HERTZ','HIPPO','HOARD','HOIST','HOLLY','HOMER','HOVEL','HUSKY','HYDRA','HYENA',
  'KNEEL','KNELT','KNOLL','KOOKY','LAPEL','LAPSE','LARCH','LARVA','LATCH','LATTE',
  'LATHE','LEAPT','LEECH','LEMUR','LINGO','LINER','LLAMA','LOATH','LOBBY','LOFTY',
  'LONER','LORRY','LOWLY','LUCID','LUSTY','LYRIC','MAIZE','MAMBO','MANIC','MANLY',
  'MATTE','MAXIM','MEALY','MELEE','MELON','MILKY','MIMIC','MIRTH','MOIST','MOOSE',
  'MOSSY','MOUSY','MUDDY','MURKY','MUSTY','MYRRH','NADIR','NAIVE','NANNY','NASAL',
  'NATTY','NAVAL','NEEDY','NIECE','NIFTY','NINNY','NIPPY','NYMPH','OFFAL','OKAPI',
  'OMBRE','OPTIC','OTTER','OVARY','OVOID','PADDY','PANSY','PAPAL','PARKA','PARRY',
  'PATSY','PATTY','PEAKY','PENAL','PERKY','PHIAL','PIXIE','PLAID','PLAIT','PLEAT',
  'PLONK','PLUCK','PLUNK','PLUSH','POACH','POUTY','PRAWN','PRIVY','PRONE','PROXY',
  'PRUDE','PRUNE','PSALM','PUFFY','PULPY','PUPIL','PYGMY','QUAFF','QUALM','QUASH',
  'QUELL','RABID','RAINY','RAJAH','RAMEN','RANDY','REGAL','REMIT','RESIN','RETRO',
  'REVEL','RIGOR','RIVET','ROBIN','ROOST','ROUGE','ROWDY','RUGBY','RUPEE','SABRA',
  'SADLY','SAPPY','SASSY','SAUNA','SAVOY','SCALD','SCALP','SCALY','SCANT','SCOFF',
  'SCOLD','SCONE','SCORN','SCOWL','SCRAM','SCREW','SCRUB','SEEDY','SERUM','SHADY',
  'SHAKY','SHAWL','SHEEN','SHOAL','SHRUB','SHRUG','SHUCK','SHUNT','SIEVE','SILKY',
  'SIREN','SIXTY','SKIFF','SKIMP','SKIRT','SNAFU','SNAKY','SNIDE','SNIFF','SNORE',
  'SNORT','SNOUT','SOOTY','SOPPY','SPANK','SPASM','SPAWN','SPECK','SPIEL','SPILL',
  'SPINY','SPIRE','SPOOK','SPORE','SPOUT','SPRIG','SPUNK','SQUAT','SQUID','STAMP',
  'STEED','STEEP','STOMP','STOOP','STRAP','STRUT','STUMP','STUNG','STUNT','SUAVE',
  'SULLY','SUNNY','SURLY','SWINE','SWIPE','SWIRL','SWOOP','TABBY','TALON','TANGY',
  'TAPIR','TAUNT','TAWNY','TEPID','THETA','THORN','THROB','THRUM','TIDAL','TILDE',
  'TIMID','TIPSY','TONIC','TOPAZ','TORSO','TROTH','TROUT','TROVE','TRUCE','TRUMP',
  'TRYST','TUMMY','TUNER','TUNIC','TUTOR','TWANG','TWEED','TWILL','ULTRA','UNDUE',
  'UNFIT','UNIFY','UNION','UNITY','UNWED','UNZIP','USURP','UTTER','UVULA','VAGUE',
  'VALID','VENAL','VERGE','VERSE','VICAR','VIGOR','VINYL','VIOLA','VIRAL','VISOR',
  'VIXEN','VODKA','VOILA','VOUCH','VULVA','WACKY','WALTZ','WARTY','WASTE','WAXEN',
  'WEEDY','WHACK','WHALE','WHIFF','WHINE','WHINY','WIMPY','WINDY','WOKEN','WOOZY',
  'WORDY','WRATH','WRING','WRONG','YEARN','ZAPPY','ZIPPY','ZONAL',
].filter((w,i,a) => w.length === 5 && a.indexOf(w) === i);

const EXTRA_VALID = [
  'AAHED','AALII','ABACI','ABACK','ABAFT','ABASH','ABATE','ABBOT','ABHOR','ABIDE',
  'ABLER','ABUZZ','ACIDS','ACNED','ACOCK','ACRED','ACTED','ACTIN','ADDAX','ADMIN',
  'AFOUL','AGAVE','AGENE','AGGIE','AGGRO','AGISM','AGIST','AGLOW','AGONE','AGORA',
  'AHOLD','AHULL','AIDED','AIMER','AIRED','AIRTS','AISLE','AJUGA','AKELA','ALAND',
  'ALANE','ALANG','ALANS','ALATE','ALBAS','ALEPH','ALFAS','ALGAL','ALIAS','ALIEN',
  'ALIGN','ALMAH','ALMAS','ALMUD','ALOES','ALTHO','ALUMS','AMAIN','AMASS','AMBIT',
  'AMIDE','AMITY','AMUCK','ANEAR','ANELE','ANENT','ANILE','ANIMA','ANIME','ANION',
  'ANISE','ANNOY','ANTIS','ANTRE','AORTA','APHID','APIAN','APISH','APPRO','APRON',
  'ARAME','AREAL','AREAR','AREIC','ARGOT','ARIEL','ARILS','ARMET','ARPEN','ARRAS',
  'ARTSY','ASANA','ATILT','ATMAN','ATOMS','ATRIP','AUGER','AULOI','AURAE','AURAR',
  'AURAS','AUREI','AURES','AURIC','AVAIL','AVIAN','AVOW','AWAIT','AWASH','AWFUL',
  'AWING','AWNED','AXIAL','AXIOM','AYAHS','AYIN','AZOTE','BACON','BADLY','BAGEL',
  'BAIRN','BALKY','BALMY','BANAL','BATED','BATTY','BAULK','BAYOU','BEADY','BEAKY',
  'BEAMY','BEANO','BEAUS','BEGET','BEGUN','BELAY','BEVEL','BEZEL','BIGOT','BILGE',
  'BIMBO','BIPED','BISON','BITTY','BLEAT','BOGUS','BORAX','BOTCH','BRAZE','BRINY',
  'BROIL','BRUIN','BRUIT','BUCKO','BUDDY','BULKY','BUOY','BURLY','BURRO','BUSHY',
  'BYLAW','BYWAY','CAKEY','CAMPY','CANDY','CAPER','CAPON','CARAT','CARBO','CARNY',
  'CAVIL','CHARY','CHEAP','CHEVY','CHINE','CLUED','COAPT','COBBY','CODEL','COLIC',
  'COLON','COMBO','COMFY','COMMO','COOKY','CORGI','CORNY','COSEY','COVEN','COWRY',
  'COYLY','CREPE','DALLY','DEITY','DELVE','DENIM','DIMLY','DINGY','DIODE','DOGGY',
  'DOLCE','DOLTS','DOPEY','DOWNY','DRAPE','DRAWL','DREGS','DROIT','DROVE','EDGED',
  'EDGER','EDGES','EGGED','EMCEE','ENDOW','ETHIC','ETHER','EXUDE','EYRIE','FAILS',
  'FAWNS','FETID','FINCH','FISHY','FIXER','FIZZY','FLECK','FLIED','FLUNG','FOGGY',
  'FOLIE','FOXED','FOYER','FRAYS','FREED','FROND','FUMED','FUNGI','FUNKY','FURZE',
  'FUZZY','GASSY','GAUDY','GAWKY','GLOGG','GLOAT','GLOSS','GOOEY','GONZO','GORGE',
  'GRACE','GRASP','GREET','GRIFF','GROAN','HAMMY','HANDY','HASTY','HEADY','HEAVE',
  'HEFTY','HIGHS','HIKED','HILLY','HOAGY','HOARY','HORNY','HOTLY','HOUND','HUFFY',
  'HULKY','HUNKY','HYPER','ICING','IDYLL','IMPEL','INEPT','INERT','INFIX','INGOT',
  'INLAY','INTER','INTRO','JAZZY','JENNY','JERKY','JIFFY','JOKEY','JOUST','JUKED',
  'JUMPY','JUNKY','KABOB','KAZOO','KINKY','KLUTZ','KNAVE','KNISH','KNURL','LAITY',
  'LAMBS','LAMER','LANKY','LARDY','LEAKY','LEAFY','LEAST','LEGGY','LEMMA','LEVER',
  'LEWD','LIEGE','LIFER','LINTY','LIVID','LOOPY','LUNKY','MACHO','MAMMY','MANGY',
  'MARRY','MASHY','MATEY','MEATY','MEDIC','MERRY','MESSY','MINTY','MIRKY','MISSY',
  'MITTS','MOCHA','MOLAR','MOLDY','MOMMY','MUGGY','MUSHY','NABOB','NITTY','NOBLY',
  'NOISY','NONCE','NUTSY','OAKEN','OLDIE','OVATE','PAGAN','PEACH','PETTY','PINEY',
  'PITHY','POLKA','POPPY','PORKY','POTTY','POUFY','PUDGY','PUGGY','PUNKY','PUSHY',
  'QUAFF','RAGGY','RASPY','RATTY','REEDY','REFIT','REPOT','RERUN','RIFER','RIMY',
  'RINKY','ROGUES','ROWDY','RUMBA','RUNNY','SAGGY','SAVVY','SEEDY','SHALY','SLIMY',
  'SLUNK','SOOTY','SPOOKY','STAGY','STEWY','STONY','SWIPE','TAFFY','TASTY','TATTY',
  'TERSE','TIZZY','TOFFY','TOPSY','TOUCAN','TOWNY','TROTH','TUBBY','TYPEY','UNDID',
  'UPPISH','VAPID','WADED','WAGER','WASHY','WHELP','YUMMY','CAULK','CABAL','CABBY',
  'CACHE','CADET','CAECA','CAMPY','ACORN','AGAIN','AGAVE','ALGAE','ALLAY','ALLOT',
  'ALOOF','ALTAR','APTLY','AREAL','ARRAY','ATONE','AUGUR','ABODE','AFOOT','APART',
  'APRON','AFTER','ADDED','ADULT','AFIRE','AGILE','AGING','AGONY','AIDED','AIMER',
  'AIRED','AISLE','ALIKE','ALIVE','ALONE','ALOUD','AMAZE','AMBER','AMBLE','AMEND',
  'AMPLE','AMUSE','ANNEX','ANTIC','ANVIL','APHID','APTLY','ARBOR','ARDOR','ARSON',
  'ASKEW','ATTIC','AVERT','BADGE','BAGGY','BANJO','BARON','BASTE','BATON','BEIGE',
  'BELLE','BEVEL','BEZEL','BIGOT','BILGE','BIMBO','BIPED','BIRCH','BISON','BLEAT',
  'BOGUS','BOXER','BRASH','BRAWN','BRAZE','BRISK','BROOD','BROTH','BUGLE','BULGE',
  'BUMPY','BUNNY','BURLY','BYWAY','CAIRN','CANAL','CANNY','CANOE','CARGO','CAROL',
  'CEDAR','CHAFE','CHANT','CHASM','CHIDE','CHILI','CHIVE','CHORD','CHORE','CIRCA',
  'CLAMP','CLANG','CLANK','CLASH','CLASP','CLEAT','CLEFT','CLINK','CLOAK','CLONE',
  'CLOVE','COMET','COMMA','CONCH','CORAL','CRAMP','CRAVE','CRAWL','CREAK','CRIMP',
  'CRISP','CROAK','CROON','CRUMB','CRYPT','CUBIC','CURLY','DAISY','DECOY','DERBY',
  'DINGO','DIRGE','DISCO','DITCH','DITTY','DOLLY','DOWDY','DROWN','DRUID','DUCHY',
  'DUNCE','DWARF','EASEL','EERIE','EGRET','ELBOW','ELDER','ELEGY','ELIDE','ELOPE',
  'EMBER','EMERY','ENVOY','EPOCH','EPOXY','EVOKE','EXCEL','EXILE','EXPEL','EXTOL',
  'FABLE','FACET','FAKER','FARCE','FAUNA','FERAL','FERRY','FETCH','FIEND','FIERY',
  'FJORD','FLAIL','FLAIR','FLASK','FLORA','FLOSS','FLUNK','FLUTE','FOAMY','FOLIO',
  'FOLLY','FORAY','FORTE','FORUM','FRAIL','FRANK','FRAUD','FREAK','FRISK','FROTH',
  'FROZE','GABLE','GAUZE','GAVEL','GECKO','GENIE','GENRE','GIRLY','GIRTH','GIZMO',
  'GLYPH','GNARL','GNASH','GNOME','GODLY','GOLEM','GORGE','GOUGE','GOURD','GRAFT',
  'GRAIL','GRIPE','GRIST','GROUT','GRUEL','GRUFF','GUAVA','GUISE','GULCH','GULLY',
  'GUMMY','GUSTO','GYPSY','HABIT','HARDY','HATCH','HAVEN','HAVOC','HAZEL','HEIST',
  'HELIX','HERBY','HERTZ','HIPPO','HOARD','HOIST','HOLLY','HOMER','HOVEL','HUSKY',
  'HYDRA','HYENA','KNEEL','KNELT','KNOLL','KOOKY','LAPEL','LAPSE','LARCH','LARVA',
  'LATCH','LATTE','LATHE','LEAPT','LEECH','LEMUR','LINGO','LINER','LLAMA','LOATH',
  'LOBBY','LOFTY','LONER','LORRY','LOWLY','LUCID','LUSTY','LYRIC','MAIZE','MAMBO',
  'MANIC','MANLY','MATTE','MAXIM','MEALY','MELEE','MELON','MILKY','MIMIC','MIRTH',
  'MOIST','MOOSE','MOSSY','MOUSY','MUDDY','MURKY','MUSTY','MYRRH','NADIR','NAIVE',
  'NANNY','NASAL','NATTY','NAVAL','NEEDY','NIECE','NIFTY','NINNY','NIPPY','NYMPH',
  'OFFAL','OKAPI','OMBRE','OPTIC','OTTER','OVARY','OVOID','PADDY','PANSY','PAPAL',
  'PARKA','PARRY','PATSY','PATTY','PEAKY','PENAL','PERKY','PHIAL','PIXIE','PLAID',
  'PLAIT','PLEAT','PLONK','PLUCK','PLUNK','PLUSH','POACH','POUTY','PRAWN','PRIVY',
  'PRONE','PROXY','PRUDE','PRUNE','PSALM','PUFFY','PULPY','PUPIL','PYGMY','QUALM',
  'QUASH','QUELL','RABID','RAINY','RAJAH','RAMEN','RANDY','REGAL','REMIT','RESIN',
  'RETRO','REVEL','RIGOR','RIVET','ROBIN','ROOST','ROUGE','RUGBY','RUPEE','SABRA',
  'SADLY','SAPPY','SASSY','SAUNA','SAVOY','SCALD','SCALP','SCALY','SCANT','SCOFF',
  'SCOLD','SCONE','SCORN','SCOWL','SCRAM','SCREW','SCRUB','SERUM','SHADY','SHAKY',
  'SHAWL','SHEEN','SHOAL','SHRUB','SHRUG','SHUCK','SHUNT','SIEVE','SILKY','SIREN',
  'SIXTY','SKIFF','SKIMP','SKIRT','SNAFU','SNAKY','SNIDE','SNIFF','SNORE','SNORT',
  'SNOUT','SOPPY','SPANK','SPASM','SPAWN','SPECK','SPIEL','SPILL','SPINY','SPIRE',
  'SPOOK','SPORE','SPOUT','SPRIG','SPUNK','SQUAT','SQUID','STAMP','STEED','STEEP',
  'STOMP','STOOP','STRAP','STRUT','STUMP','STUNG','STUNT','SUAVE','SULLY','SUNNY',
  'SURLY','SWINE','SWIRL','SWOOP','TABBY','TALON','TANGY','TAPIR','TAUNT','TAWNY',
  'TEPID','THETA','THORN','THROB','THRUM','TIDAL','TILDE','TIMID','TIPSY','TONIC',
  'TOPAZ','TORSO','TROTH','TROUT','TROVE','TRUCE','TRUMP','TRYST','TUMMY','TUNER',
  'TUNIC','TUTOR','TWANG','TWEED','TWILL','ULTRA','UNDUE','UNFIT','UNIFY','UNION',
  'UNITY','UNWED','UNZIP','USURP','UTTER','UVULA','VAGUE','VALID','VENAL','VERGE',
  'VERSE','VICAR','VIGOR','VINYL','VIOLA','VIRAL','VISOR','VIXEN','VODKA','VOILA',
  'VOUCH','VULVA','WACKY','WALTZ','WARTY','WASTE','WAXEN','WEEDY','WHACK','WHALE',
  'WHIFF','WHINE','WHINY','WIMPY','WINDY','WOKEN','WOOZY','WORDY','WRATH','WRING',
  'WRONG','YEARN','ZAPPY','ZIPPY','ZONAL',
].filter(w => w.length === 5);

const VALID_SET = new Set([...ANSWERS, ...EXTRA_VALID]);

function getDailyWord() {
  const epoch = new Date('2024-01-01');
  const today = new Date();
  today.setHours(0,0,0,0);
  const day = Math.floor((today - epoch) / 86400000);
  return ANSWERS[((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length];
}

function getTodayKey() {
  const d = new Date();
  return 'wordle-' + d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

function evaluateGuess(guess, target) {
  const result = Array(5).fill('absent');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) result[i] = 'correct';
    else remaining[target[i]] = (remaining[target[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    if (remaining[guess[i]] > 0) { result[i] = 'present'; remaining[guess[i]]--; }
  }
  return result;
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('wordle-stats') || 'null') || { played:0,wins:0,streak:0,maxStreak:0,dist:{1:0,2:0,3:0,4:0,5:0,6:0} }; }
  catch { return { played:0,wins:0,streak:0,maxStreak:0,dist:{1:0,2:0,3:0,4:0,5:0,6:0} }; }
}
function saveStats(s) { localStorage.setItem('wordle-stats', JSON.stringify(s)); }

function loadGameState(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function saveGameState(key, state) { localStorage.setItem(key, JSON.stringify(state)); }

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

export default function Wordle({ onBack }) {
  const todayKey = getTodayKey();
  const target = getDailyWord();
  const saved = loadGameState(todayKey);

  const [guesses, setGuesses] = useState(saved?.guesses || []);
  const [input, setInput] = useState('');
  const [gameState, setGameState] = useState(saved?.gameState || 'playing');
  const [shake, setShake] = useState(false);
  const [bounceRow, setBounceRow] = useState(-1);
  const [message, setMessage] = useState('');
  const [hardMode, setHardMode] = useState(() => localStorage.getItem('wordle-hard') === 'true');
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(loadStats);
  const [showHS, setShowHS] = useState(false);
  const [pendingGuesses, setPendingGuesses] = useState(null);
  const msgTimer = useRef(null);

  function showMsg(msg, duration = 1500) {
    clearTimeout(msgTimer.current);
    setMessage(msg);
    msgTimer.current = setTimeout(() => setMessage(''), duration);
  }

  const letterStates = {};
  for (const g of guesses) {
    for (const { char, state } of g.letters) {
      const cur = letterStates[char];
      if (state === 'correct') letterStates[char] = 'correct';
      else if (state === 'present' && cur !== 'correct') letterStates[char] = 'present';
      else if (!cur) letterStates[char] = 'absent';
    }
  }

  function getHardModeError(word) {
    const mustBeAt = {};
    const mustContain = {};
    for (const g of guesses) {
      g.letters.forEach(({ char, state }, i) => {
        if (state === 'correct') mustBeAt[i] = char;
        if (state === 'correct' || state === 'present') mustContain[char] = (mustContain[char] || 0) + 1;
      });
    }
    const ordinals = ['1st','2nd','3rd','4th','5th'];
    for (const [pos, char] of Object.entries(mustBeAt)) {
      if (word[parseInt(pos)] !== char) return ordinals[pos] + ' letter must be ' + char;
    }
    for (const [char, count] of Object.entries(mustContain)) {
      if (word.split('').filter(c => c === char).length < count) return 'Guess must contain ' + char;
    }
    return null;
  }

  const submitGuess = useCallback(() => {
    if (gameState !== 'playing') return;
    const word = input.toUpperCase();
    if (word.length < 5) {
      showMsg('Not enough letters');
      setShake(true); setTimeout(() => setShake(false), 600);
      return;
    }
    if (!VALID_SET.has(word)) {
      showMsg('Not in word list');
      setShake(true); setTimeout(() => setShake(false), 600);
      return;
    }
    if (hardMode && guesses.length > 0) {
      const err = getHardModeError(word);
      if (err) { showMsg(err); setShake(true); setTimeout(() => setShake(false), 600); return; }
    }
    const states = evaluateGuess(word, target);
    const letters = word.split('').map((char, i) => ({ char, state: states[i] }));
    const newGuesses = [...guesses, { letters }];
    setGuesses(newGuesses);
    setInput('');

    const won = states.every(s => s === 'correct');
    const lost = !won && newGuesses.length >= 6;
    const newState = won ? 'won' : lost ? 'lost' : 'playing';
    saveGameState(todayKey, { guesses: newGuesses, gameState: newState });

    if (won) {
      const winMsgs = ['Genius!','Magnificent!','Impressive!','Splendid!','Great!','Phew!'];
      setTimeout(() => {
        setGameState('won');
        setBounceRow(newGuesses.length - 1);
        showMsg(winMsgs[newGuesses.length - 1] || 'Nice!', 2000);
        const ns = { ...loadStats() };
        ns.played++; ns.wins++; ns.streak++;
        ns.maxStreak = Math.max(ns.maxStreak, ns.streak);
        ns.dist = { ...ns.dist, [newGuesses.length]: (ns.dist[newGuesses.length] || 0) + 1 };
        saveStats(ns); setStats(ns);
        isHighScore('wordle', newGuesses.length, false).then(yes => { if (yes) { setPendingGuesses(newGuesses.length); setShowHS(true); } });
        setTimeout(() => setShowStats(true), 2500);
      }, 1600);
    } else if (lost) {
      setTimeout(() => {
        setGameState('lost');
        showMsg(target, 4000);
        const ns = { ...loadStats() };
        ns.played++; ns.streak = 0;
        saveStats(ns); setStats(ns);
        setTimeout(() => setShowStats(true), 2000);
      }, 1600);
    }
  // eslint-disable-next-line
  }, [input, guesses, gameState, target, hardMode, todayKey]);

  const pressKey = useCallback((key) => {
    if (gameState !== 'playing') return;
    if (key === 'ENTER') { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setInput(i => i.slice(0,-1)); return; }
    if (/^[A-Z]$/.test(key) && input.length < 5) setInput(i => i + key);
  }, [gameState, input, submitGuess]);

  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') pressKey('ENTER');
      else if (e.key === 'Backspace') pressKey('⌫');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toUpperCase());
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressKey]);

  function toggleHardMode() {
    if (guesses.length > 0) { showMsg('Hard mode can only be enabled at the start of a round'); return; }
    const next = !hardMode;
    setHardMode(next);
    localStorage.setItem('wordle-hard', String(next));
  }

  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(...Object.values(stats.dist), 1);

  return (
    <div className="wordle-page">
      <div className="wordle-topbar">
        <button className="wordle-back" onClick={onBack}>← Game Vault</button>
        <h1 className="wordle-title">Wordle</h1>
        <div className="wordle-topbar-right">
          <button
            className={'wordle-icon-btn' + (hardMode ? ' active' : '')}
            onClick={toggleHardMode}
            title={hardMode ? 'Hard Mode ON' : 'Hard Mode OFF'}
          >🔥</button>
          <button className="wordle-icon-btn" onClick={() => setShowStats(true)} title="Statistics">📊</button>
        </div>
      </div>

      {message && <div className="wordle-message">{message}</div>}

      <div className="wordle-board">
        {Array.from({ length: 6 }, (_, row) => {
          const guess = guesses[row];
          const isActive = row === guesses.length && gameState === 'playing';
          const isBounce = row === bounceRow;
          return (
            <div key={row} className={'wordle-row' + (isActive && shake ? ' wordle-shake' : '')}>
              {Array.from({ length: 5 }, (_, col) => {
                let char = '';
                let state = '';
                if (guess) { char = guess.letters[col].char; state = guess.letters[col].state; }
                else if (isActive) char = input[col] || '';
                const filled = char && !guess;
                return (
                  <div
                    key={col}
                    className={[
                      'wordle-tile',
                      filled ? 'wordle-tile--filled' : '',
                      guess ? 'wordle-tile--reveal' : '',
                      state ? 'wordle-tile--' + state : '',
                      isBounce ? 'wordle-tile--bounce' : '',
                    ].filter(Boolean).join(' ')}
                    style={
                      guess ? { animationDelay: col * 300 + 'ms' }
                      : isBounce ? { animationDelay: col * 100 + 'ms' }
                      : {}
                    }
                  >{char}</div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="wordle-keyboard">
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="wordle-kb-row">
            {row.map(key => (
              <button
                key={key}
                className={'wordle-key' + (key.length > 1 ? ' wordle-key--wide' : '') + ' wordle-key--' + (letterStates[key] || 'unused')}
                onPointerDown={e => { e.preventDefault(); pressKey(key); }}
              >{key}</button>
            ))}
          </div>
        ))}
      </div>

      {showStats && (
        <div className="wordle-modal-backdrop" onClick={() => setShowStats(false)}>
          <div className="wordle-modal" onClick={e => e.stopPropagation()}>
            <button className="wordle-modal-close" onClick={() => setShowStats(false)}>✕</button>
            <h2 className="wordle-modal-title">STATISTICS</h2>
            <div className="wordle-stats-row">
              {[
                [stats.played, 'Played'],
                [winPct, 'Win %'],
                [stats.streak, 'Current\nStreak'],
                [stats.maxStreak, 'Max\nStreak'],
              ].map(([n, label]) => (
                <div key={label} className="wordle-stat">
                  <span className="wordle-stat-num">{n}</span>
                  <span className="wordle-stat-label">{label}</span>
                </div>
              ))}
            </div>
            <h3 className="wordle-modal-subtitle">GUESS DISTRIBUTION</h3>
            <div className="wordle-dist">
              {[1,2,3,4,5,6].map(n => {
                const count = stats.dist[n] || 0;
                const pct = Math.max(7, Math.round((count / maxDist) * 100));
                const isCurrent = gameState === 'won' && n === guesses.length;
                return (
                  <div key={n} className="wordle-dist-row">
                    <span className="wordle-dist-num">{n}</span>
                    <div className="wordle-dist-bar-wrap">
                      <div className={'wordle-dist-bar' + (isCurrent ? ' wordle-dist-bar--current' : '')} style={{ width: pct + '%' }}>{count}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {gameState !== 'playing' && (
              <div className="wordle-modal-answer">
                {gameState === 'won' ? '🎉 ' : ''}Answer: <strong>{target}</strong>
              </div>
            )}
            {hardMode && <div className="wordle-hard-badge">🔥 Hard Mode Active</div>}
          </div>
        </div>
      )}
      {showHS && <HighScoreModal gameId="wordle" score={pendingGuesses} label="guesses" higherIsBetter={false} onSave={() => setShowHS(false)} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
