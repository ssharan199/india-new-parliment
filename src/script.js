/**
 * The voiceover script, wired to the model.
 *
 * Each beat knows which camera preset it belongs to and, optionally, which
 * annotation to pin open. Clicking a line flies you there; Play walks the whole
 * script on its own timings, which doubles as a preview of the finished reel.
 *
 * Text is kept in sync with script-hi.md — that file is the human-readable copy,
 * this is the one the viewer runs.
 */

export const SCRIPT = [
  { t: 0, view: 'aerial',
    text: 'Aap apna ghar square banate ho. Rectangle banate ho. Toh India ka naya Sansad Bhavan <b>triangle</b> kyun hai?' },
  { t: 6, view: 'aerial',
    text: 'Iske peeche teen wajah hain — aur teeno chalaak hain.' },

  { t: 9, view: 'facade', label: 'facade',
    text: 'Pehli — <b>structure</b>. Triangle engineering ki sabse stable shape hai. Push it, twist it, shake it — apna aakaar nahi chhodta.' },
  { t: 16, view: 'facade', label: 'plan',
    text: 'Isi liye ye building Delhi ke seismic zone ke liye design ki gayi hai.' },

  { t: 20, view: 'doors', label: 'doors-overview',
    text: 'Doosri — <b>symbolism</b>. Teen kone, teen ceremonial dwar: <b>Gyan</b>, <b>Shakti</b>, aur <b>Karma</b> — gyaan, shakti, aur kartavya.' },
  { t: 28, view: 'doors',
    text: 'Par asli maza yahan hai: darwaaze chhe hain, aur har ek ka apna jaanwar hai.' },

  { t: 32, view: 'doors', label: 'door-gaja',
    text: '<b>Gaja Dwar</b> — haathi. Buddhi aur samriddhi.' },
  { t: 35, view: 'doors', label: 'door-ashwa',
    text: '<b>Ashwa Dwar</b> — ghoda. Taakat aur himmat.' },
  { t: 38, view: 'doors', label: 'door-garuda',
    text: '<b>Garuda Dwar</b> — Vishnu ka vaahan. Shakti aur dharma.' },
  { t: 41, view: 'doors', label: 'door-makara',
    text: '<b>Makara</b> — aadha-machhli jeev. "Unity in diversity".' },
  { t: 44, view: 'doors', label: 'door-shardula',
    text: '<b>Shardula</b> — sher aur baagh ka mishran. "Power of the people".' },
  { t: 47, view: 'doors', label: 'door-hamsa',
    text: '<b>Hamsa</b> — hans, moksha ka prateek. Chhe darwaaze, chhe kahaniyan.' },

  { t: 52, view: 'lok', label: 'lok-ceiling',
    text: 'Andar jao — aur har kamra ek symbol pehanta hai. <b>Lok Sabha</b>: theme hai <b>mor</b>, hamara rashtriya pakshi.' },
  { t: 58, view: 'lok', label: 'lok-benches',
    text: 'Chhat par mor ke pankh, farsh par hari carpet, aur 888 seats.' },

  { t: 62, view: 'rajya', label: 'rajya-ceiling',
    text: '<b>Rajya Sabha</b>: theme hai <b>kamal</b>, rashtriya phool. Laal carpet, kamal ki pankhudiyan chhat par, 384 seats.' },
  { t: 68, view: 'rajya',
    text: 'Dono milkar joint session mein 1,272 log baith sakte hain.' },

  { t: 72, view: 'court', label: 'courtyard',
    text: 'Aur beech mein? Khula aasman, aur ek <b>bargad ka ped</b> — rashtriya vriksh.' },

  { t: 78, view: 'emblem', label: 'emblem',
    text: 'Sabse upar, chhat par — <b>Ashoka ka Sinh Stambh</b>. Chaar sher, chaar disha, ek desh.' },

  { t: 84, view: 'aerial',
    text: 'Toh ye sirf ek shape nahi hai. Ye science hai, culture hai, aur smart design — teeno ek saath.' },
];

const fmt = (t) => `0:${String(Math.floor(t)).padStart(2, '0')}`;

export class ScriptPanel {
  /**
   * @param {HTMLElement} host   container for the beat rows
   * @param {object} api         { goTo(view), pin(labelId) }
   */
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.rows = [];
    this.active = -1;
    this.timer = null;

    SCRIPT.forEach((beat, i) => {
      const row = document.createElement('button');
      row.className = 'beat';
      row.innerHTML = `<span class="beat-t">${fmt(beat.t)}</span><span class="beat-x">${beat.text}</span>`;
      row.onclick = () => { this.stop(); this.go(i); };
      host.appendChild(row);
      this.rows.push(row);
    });
  }

  go(i) {
    const beat = SCRIPT[i];
    if (!beat) return;
    this.active = i;
    this.rows.forEach((r, k) => r.classList.toggle('on', k === i));
    this.rows[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    this.api.goTo(beat.view);
    // Pin after the camera tween so the card lands on a settled frame.
    clearTimeout(this._pinTimer);
    this._pinTimer = setTimeout(() => this.api.pin(beat.label || null), 900);
  }

  /** Walk the script from `i`, honouring the gaps between timecodes. */
  play(i = 0) {
    this.stop();
    this.playing = true;
    const step = (k) => {
      if (!this.playing || k >= SCRIPT.length) { this.stop(); return; }
      this.go(k);
      const next = SCRIPT[k + 1];
      if (!next) { this.timer = setTimeout(() => this.stop(), 3000); return; }
      this.timer = setTimeout(() => step(k + 1), (next.t - SCRIPT[k].t) * 1000);
    };
    step(i);
  }

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.onStop?.();
  }
}
