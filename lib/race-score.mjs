// Original course scores: scale-degree:eighths; '_' is a rest.
// Each course owns its meter, harmony, rhythm section and orchestration.
const MAJOR=[0,2,4,5,7,9,11], MINOR=[0,2,3,5,7,8,10], DORIAN=[0,2,3,5,7,9,10], PHRYGIAN=[0,1,3,5,7,8,10];
const scaleTone=(scale,d)=>scale[((d%7)+7)%7]+Math.floor(d/7)*12;
export const midiFrequency=n=>440*2**((n-69)/12);
function piece({bpm,tonicMidi,instrument,scale,harmony,lines,groove,stepsPerBar=8,padInstrument='strings',mix,swing=0}){
  const bars=lines.map((line,index)=>{
    let at=0;
    const notes=line.split(' ').flatMap(token=>{
      const [degree,length]=token.split(':'); const steps=Number(length);
      const event=degree==='_'?[]:[{at,note:12+scaleTone(scale,Number(degree)),steps}]; at+=steps; return event;
    });
    if(at!==stepsPerBar)throw Error(groove+' bar '+index+': wrong meter');
    const degree=harmony[index],chord=[degree,degree+2,degree+4].map(d=>scaleTone(scale,d));
    const voicing=chord.map(n=>12+((n%12)+12)%12).sort((a,b)=>a-b);
    return {notes,chord,voicing,bass:scaleTone(scale,degree)};
  });
  return {bpm,tonicMidi,root:midiFrequency(tonicMidi),instrument,scale,bars,groove,stepsPerBar,padInstrument,mix,swing,fixedTension:false};
}
export const MUSIC_PATTERNS={
 city:piece({bpm:148,tonicMidi:43,instrument:'rock',scale:MAJOR,groove:'circuit',padInstrument:'rock',
  harmony:[0,0,3,4,0,5,3,4,5,3,0,4,3,4,4,0],
  mix:{lead:1,bass:1,pad:.74,kick:1,snare:.9,hat:.5,tom:.45},lines:[
   '4:1 4:1 7:2 6:1 5:1 4:1 _:1','7:2 6:1 5:1 4:2 2:1 _:1',
   '3:1 3:1 5:2 7:2 5:1 _:1','6:2 5:1 4:1 6:2 8:1 _:1',
   '7:1 7:1 9:2 7:1 6:1 4:1 _:1','5:2 7:1 8:1 9:2 7:1 _:1',
   '7:2 5:1 4:1 3:2 5:1 _:1','6:1 6:1 8:2 6:2 4:1 _:1',
   '5:2 7:2 9:2 8:1 _:1','7:1 7:1 5:2 3:2 5:1 _:1',
   '7:2 9:1 8:1 7:2 4:1 _:1','6:2 8:2 6:1 5:1 4:1 _:1',
   '5:2 7:2 5:2 3:1 _:1','4:1 5:1 6:2 8:2 6:1 _:1',
   '6:2 5:1 4:1 6:2 8:1 _:1','7:4 4:2 _:2',
  ]}),
 jungle:piece({bpm:114,tonicMidi:45,instrument:'mallet',scale:MINOR,groove:'canopy',stepsPerBar:12,padInstrument:'softPad',
  harmony:[0,0,3,0,5,3,0,4,0,6,5,3,0,3,4,0],
  mix:{lead:.92,bass:.72,pad:.3,kick:.35,snare:0,hat:0,tom:1},swing:.035,lines:[
   '4:2 _:1 2:2 3:1 4:2 _:1 2:2 _:1','0:3 _:1 2:2 4:3 2:2 _:1',
   '3:2 _:1 5:2 4:1 3:3 3:2 _:1','2:2 3:1 4:3 _:2 2:3 _:1',
   '5:3 _:1 7:2 5:2 4:1 2:2 _:1','3:2 5:1 7:3 _:2 5:3 _:1',
   '4:3 3:1 2:2 _:1 0:3 _:2','4:2 _:1 6:2 5:1 4:3 4:2 _:1',
   '4:2 4:1 7:3 _:2 4:3 _:1','6:3 5:1 3:2 1:3 _:3',
   '2:3 _:1 5:2 7:3 5:2 _:1','5:2 4:1 3:3 _:2 0:3 _:1',
   '2:2 _:1 4:2 3:1 2:3 0:2 _:1','3:3 4:1 5:2 3:3 _:3',
   '4:2 5:1 6:3 4:2 2:1 1:2 _:1','0:6 _:2 2:2 0:1 _:1',
  ]}),
 starlight:piece({bpm:112,tonicMidi:43,instrument:'brass',scale:MAJOR,groove:'finale',padInstrument:'strings',
  harmony:[0,4,5,3,0,1,3,4,3,4,5,2,3,4,0,0],
  mix:{lead:.92,bass:.76,pad:1.15,kick:.64,snare:.45,hat:.15,tom:.8},lines:[
   '7:3 6:1 4:3 _:1','6:4 8:3 _:1','9:3 8:1 7:3 _:1','7:4 5:3 _:1',
   '4:2 5:1 6:1 7:3 _:1','8:3 7:1 5:3 _:1','7:3 5:1 3:3 _:1','4:2 6:2 8:3 _:1',
   '7:3 8:1 10:3 _:1','8:4 6:3 _:1','7:2 8:1 9:1 7:3 _:1','6:3 5:1 4:3 _:1',
   '5:2 7:2 10:3 _:1','8:3 7:1 6:3 _:1','7:5 6:1 4:1 _:1','7:6 _:2',
  ]}),
 river:piece({bpm:94,tonicMidi:43,instrument:'flute',scale:DORIAN,groove:'river',padInstrument:'nylon',
  harmony:[0,0,3,3,0,1,0,0,3,3,6,6,0,3,0,0],
  mix:{lead:.85,bass:.52,pad:.62,kick:.25,snare:0,hat:0,tom:.45},swing:.06,lines:[
   '4:3 3:1 2:2 _:2','2:2 1:1 0:1 2:3 _:1','3:3 4:1 5:2 _:2','5:2 4:1 3:1 0:3 _:1',
   '2:3 3:1 4:2 _:2','5:3 4:1 3:3 _:1','4:2 2:2 0:2 _:2','2:4 4:2 _:2',
   '5:3 6:1 7:2 _:2','7:2 5:2 3:3 _:1','3:3 2:1 1:2 _:2','1:2 3:2 6:2 _:2',
   '4:3 3:1 2:2 _:2','3:3 2:1 0:3 _:1','2:2 3:1 4:1 2:2 _:2','0:5 _:3',
  ]}),
 pirate:piece({bpm:132,tonicMidi:43,instrument:'accordion',scale:MAJOR,groove:'shanty',stepsPerBar:6,padInstrument:'nylon',
  harmony:[0,4,0,0,3,0,4,4,5,3,0,4,3,4,0,0],
  mix:{lead:.96,bass:.88,pad:.8,kick:.66,snare:.4,hat:0,tom:.5},lines:[
   '4:1 7:2 7:1 6:1 5:1','6:2 4:1 6:2 _:1','7:2 9:1 7:2 _:1','4:1 2:2 4:2 _:1',
   '5:2 7:1 5:2 _:1','4:2 7:1 9:2 _:1','8:2 6:1 4:2 _:1','6:3 4:2 _:1',
   '5:1 7:2 9:2 _:1','7:2 5:1 3:2 _:1','4:1 7:2 9:2 _:1','8:1 6:2 4:2 _:1',
   '5:2 7:1 5:2 _:1','6:2 8:1 6:2 _:1','7:3 4:2 _:1','7:4 _:2',
  ]}),
 cloud:piece({bpm:82,tonicMidi:41,instrument:'air',scale:MAJOR,groove:'sky',stepsPerBar:6,padInstrument:'softPad',
  harmony:[0,0,3,3,5,5,4,4,1,1,3,3,4,4,0,0],
  mix:{lead:.72,bass:.3,pad:.72,kick:0,snare:0,hat:0,tom:0},lines:[
   '7:4 _:2','9:3 7:2 _:1','7:3 5:2 _:1','5:4 _:2',
   '5:3 7:2 _:1','9:4 _:2','8:3 6:2 _:1','6:4 _:2',
   '5:3 8:2 _:1','8:3 7:1 5:1 _:1','7:4 _:2','5:3 3:2 _:1',
   '4:3 6:2 _:1','8:3 6:2 _:1','7:4 _:2','7:5 _:1',
  ]}),
 custom:piece({bpm:126,tonicMidi:43,instrument:'electric',scale:MAJOR,groove:'custom',padInstrument:'nylon',
  harmony:[0,3,4,0,5,1,4,0,3,4,5,0,1,4,4,0],
  mix:{lead:.9,bass:.75,pad:.65,kick:.7,snare:.6,hat:.35,tom:.4},lines:[
   '4:2 7:2 9:3 _:1','7:3 5:1 3:3 _:1','4:2 6:2 8:3 _:1','7:4 4:3 _:1',
   '5:2 7:2 9:3 _:1','8:3 7:1 5:3 _:1','6:2 8:2 6:3 _:1','7:4 4:3 _:1',
   '5:2 7:2 10:3 _:1','8:3 7:1 6:3 _:1','7:2 9:2 7:3 _:1','7:3 6:1 4:3 _:1',
   '5:3 4:1 3:3 _:1','4:2 6:2 8:3 _:1','6:3 5:1 4:3 _:1','7:6 _:2',
  ]}),
};
export const GOJO_MUSIC_PATTERN={...piece({bpm:146,tonicMidi:40,instrument:'pulse',scale:PHRYGIAN,groove:'duel',padInstrument:'softPad',
 harmony:[0,0,1,0,0,5,1,0,5,5,1,1,0,3,1,0],
 mix:{lead:.8,bass:1.15,pad:.5,kick:1,snare:.5,hat:.2,tom:1},lines:[
  '4:1 _:1 4:1 4:1 2:2 0:1 _:1','2:1 4:1 7:2 4:2 2:1 _:1',
  '1:2 3:1 5:1 3:2 1:1 _:1','2:1 4:1 4:2 2:2 0:1 _:1',
  '0:1 2:1 4:2 4:1 _:1 2:1 _:1','2:2 5:1 7:1 5:2 2:1 _:1',
  '3:1 5:1 5:2 3:2 1:1 _:1','2:1 4:1 7:2 4:2 2:1 _:1',
  '5:1 5:1 7:2 9:2 7:1 _:1','7:1 5:1 5:2 2:2 5:1 _:1',
  '5:1 3:1 1:2 3:2 5:1 _:1','5:2 3:1 1:1 3:2 1:1 _:1',
  '2:1 4:1 7:2 4:2 2:1 _:1','3:2 5:2 3:2 0:1 _:1',
  '1:2 3:2 5:2 3:1 _:1','0:4 2:1 4:1 _:2',
 ]}),fixedTension:true};
// Every secondary oscillator stays at the fundamental, never an octave above.
// The lead ceiling is C5; timbre and arrangement create energy, not shrillness.
export const MUSIC_VOICES={
 rock:{partials:[0,1,.46,.22,.09,.035],attack:.025,sustain:.72,release:.10,colour:.09,octave:false,cutoff:1900,pan:0,detune:2},
 mallet:{partials:[0,1,.07,.025],attack:.018,sustain:.36,release:.11,colour:.02,octave:false,cutoff:1150,pan:-.12,detune:0},
 brass:{partials:[0,1,.38,.21,.085,.025],attack:.085,sustain:.8,release:.17,colour:.1,octave:false,cutoff:1750,pan:0,detune:2},
 flute:{partials:[0,1,.085,.025],attack:.065,sustain:.77,release:.14,colour:.035,octave:false,cutoff:1250,pan:-.1,detune:0},
 air:{partials:[0,1,.055,.015],attack:.14,sustain:.82,release:.22,colour:.06,octave:false,cutoff:1000,pan:.1,detune:2},
 accordion:{partials:[0,1,.16,.31,.025,.07],attack:.035,sustain:.76,release:.13,colour:.08,octave:false,cutoff:1650,pan:0,detune:3},
 pulse:{partials:[0,1,.38,.13,.04],attack:.022,sustain:.66,release:.10,colour:.05,octave:false,cutoff:1300,pan:0,detune:0},
 nylon:{partials:[0,1,.3,.1,.035],attack:.022,sustain:.4,release:.12,colour:.04,octave:false,cutoff:1450,pan:-.12,detune:0},
 strings:{partials:[0,1,.29,.16,.055,.02],attack:.11,sustain:.82,release:.2,colour:.1,octave:false,cutoff:1450,pan:0,detune:3},
 softPad:{partials:[0,1,.075,.025],attack:.19,sustain:.8,release:.25,colour:.035,octave:false,cutoff:900,pan:0,detune:1},
 electric:{partials:[0,1,.19,.06,.015],attack:.03,sustain:.6,release:.12,colour:.04,octave:false,cutoff:1550,pan:.1,detune:0},
};
export function musicVoiceEnvelope(instrument,duration){
 const p=MUSIC_VOICES[instrument],attack=Math.min(p.attack,duration*.2),decay=Math.min(attack+.13,duration*.4);
 return {attack,decay,release:Math.max(decay,duration-Math.min(p.release,duration*.28)),sustain:p.sustain};
}
export function raceMusicStep(step,pattern,intensity=0){
 const tick=Number.isFinite(step)?Math.max(0,Math.floor(step)):0,n=pattern.stepsPerBar;
 const bar=Math.floor(tick/n)%pattern.bars.length,beat=tick%n,section=Math.floor(bar/8),written=pattern.bars[bar];
 const lead=written.notes.find(note=>note.at===beat),g=pattern.groove;
 let bassBeats=[],kickBeats=[],snareBeats=[],hatBeats=[],tomBeats=[],shakerBeats=[],chordBeats=[0];
 let chordSteps=n-.18,bassSteps=2.5;
 switch(g){
  case 'circuit':bassBeats=[0,2,3,4,6,7];kickBeats=[0,3,4];snareBeats=[2,6];hatBeats=[1,3,5,7];chordBeats=[0,3,6];chordSteps=1.65;bassSteps=.8;break;
  case 'canopy':bassBeats=[0,5,8];kickBeats=[0];tomBeats=[0,2,5,6,8,11];shakerBeats=[1,4,7,10];bassSteps=2.2;break;
  case 'finale':bassBeats=[0,4];kickBeats=[0];snareBeats=[4];hatBeats=section?[2,6]:[];tomBeats=bar%4===3?[6,7]:[];bassSteps=3.6;break;
  case 'river':bassBeats=[0,5];kickBeats=bar%2===0?[0]:[];tomBeats=[3];shakerBeats=[2,6];chordBeats=[0,5];chordSteps=2.5;bassSteps=2.5;break;
  case 'shanty':bassBeats=[0,3];kickBeats=[0];snareBeats=[3];tomBeats=bar%4===3?[4,5]:[];shakerBeats=[2,5];chordBeats=[0,3];chordSteps=2.65;bassSteps=2.5;break;
  case 'sky':bassBeats=bar%2===0?[0]:[];bassSteps=5.5;break;
  case 'duel':bassBeats=[0,1,3,4,5,7];kickBeats=[0,4,7];snareBeats=[4];hatBeats=[3,7];tomBeats=[2,6];chordSteps=7.8;bassSteps=.7;break;
  default:bassBeats=[0,3,4,7];kickBeats=[0,4];snareBeats=[2,6];hatBeats=[1,5];chordBeats=[0,4];chordSteps=3.7;bassSteps=1.7;
 }
 let chordOn=chordBeats.includes(beat);
 if(['sky','canopy','finale','duel'].includes(g)){
  const same=(a,b)=>a.voicing.join(',')===b.voicing.join(',');
  chordOn=beat===0&&(bar===0||!same(written,pattern.bars[bar-1]));
  if(chordOn){let held=1;while(bar+held<pattern.bars.length&&held<4&&same(written,pattern.bars[bar+held]))held++;chordSteps=n*held-.18;}
 }
 const bass=bassBeats.includes(beat)?(beat===0||g==='duel'?written.bass:written.chord[2]%12):null;
 return {bar,beat,section,chord:written.chord,voicing:written.voicing,
  lead:lead?.note??null,leadSteps:lead?.steps??0,leadVelocity:lead?(beat%3===0?1:.9):0,
  bass,bassSteps,bassVelocity:beat===0?1:.82,chordOn,chordSteps,arp:null,
  kick:kickBeats.includes(beat),snare:snareBeats.includes(beat),hat:hatBeats.includes(beat),
  toms:tomBeats.includes(beat)?[{frequency:g==='canopy'?(beat%3===0?110:164):g==='duel'?82:124,gain:beat%3===0?1:.65}]:[],
  shaker:shakerBeats.includes(beat),fill:false,cymbal:false,
  offset:beat%2===1?pattern.swing:0,energy:pattern.fixedTension ? .94 : section===0 ? .88 : .96};
}
export function musicScheduleWindow(nextAt,now,stepDuration){
 const step=Number.isFinite(stepDuration)?Math.max(.05,stepDuration):.2;
 return {start:Number.isFinite(nextAt)&&nextAt>=now?nextAt:now+.025,maxSteps:Math.min(8,Math.ceil(.18/step)+1)};
}
