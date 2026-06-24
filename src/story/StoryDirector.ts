export type StoryTone = "calm" | "watch" | "blood";

type MoonState = {
  blood: boolean;
  secondsRemaining: number;
  progress: number;
};

type StoryInput = {
  enemyState?: string;
  moon: MoonState;
  hidden: boolean;
  xray: boolean;
  dead: boolean;
};

type StoryOutput = {
  chapter: string;
  logline: string;
  objective: string;
  whisper: {
    visible: boolean;
    text: string;
    tone: StoryTone;
  };
};

export class StoryDirector {
  private started = false;
  private sawFirstWatch = false;
  private sawFirstChase = false;
  private sawBloodMoon = false;
  private survivedBloodMoon = false;
  private usedHide = false;
  private usedXray = false;
  private dead = false;
  private whisperText = "";
  private whisperTone: StoryTone = "calm";
  private whisperUntil = 0;
  private nextAmbientAt = 0;
  private ambientIndex = 0;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.nextAmbientAt = this.now() + 14;
    this.showWhisper("Relatorio 228-B: se ouvir trombetas, nao responda.", "calm", 6);
  }

  recordEnemyState(state: string): void {
    if (state === "WATCH" && !this.sawFirstWatch) {
      this.sawFirstWatch = true;
      this.showWhisper("Primeiro contato: ele nao caminha ate voce. Ele escolhe uma parede.", "watch", 6.4);
      return;
    }

    if (state === "AMBUSH") {
      this.showWhisper("A quina mudou. Ele aprendeu onde voce olha.", "watch", 5);
      return;
    }

    if (state === "CHASE" && this.sawBloodMoon && !this.sawFirstChase) {
      this.sawFirstChase = true;
      this.showWhisper("Durante o despertar, ele tem corpo. Corra para os botoes vermelhos.", "blood", 6);
    }
  }

  recordBloodMoonStart(): void {
    this.sawBloodMoon = true;
    this.showWhisper("Crimson Awakening: as trombetas abriram o ceu.", "blood", 6.2);
  }

  recordBloodMoonEnd(): void {
    if (!this.sawBloodMoon || this.dead) return;
    if (!this.survivedBloodMoon) {
      this.survivedBloodMoon = true;
      this.showWhisper("Voce sobreviveu ao primeiro despertar. Algo em voce respondeu de volta.", "calm", 7);
      return;
    }

    this.showWhisper("O labirinto recuou, mas nao esqueceu o caminho ate voce.", "calm", 5.6);
  }

  recordHide(): void {
    if (!this.usedHide) {
      this.usedHide = true;
      this.showWhisper("A parede aceitou sua respiracao. Fique quieto ate o vermelho passar.", "watch", 6);
      return;
    }

    this.showWhisper("Entre as paredes, ele te ouve como memoria.", "watch", 4.8);
  }

  recordXRay(): void {
    if (this.usedXray) return;
    this.usedXray = true;
    this.showWhisper("A lente nao mostra o monstro. Ela mostra onde a casa ainda lembra dele.", "watch", 6);
  }

  recordDeath(): void {
    this.dead = true;
    this.showWhisper("A Grande Uniao fechou. Voce voltou para casa.", "blood", 999);
  }

  update(input: StoryInput): StoryOutput {
    if (!this.started) {
      return this.buildOutput(input, false);
    }

    if (input.dead && !this.dead) this.recordDeath();
    if (input.xray && !this.usedXray) this.recordXRay();

    const now = this.now();
    if (now >= this.nextAmbientAt && now > this.whisperUntil) {
      const ambient = this.pickAmbientLine(input);
      this.showWhisper(ambient.text, ambient.tone, 5.4);
      this.nextAmbientAt = now + (input.moon.blood ? 9 : input.hidden ? 11 : 18);
    }

    return this.buildOutput(input, now <= this.whisperUntil);
  }

  private buildOutput(input: StoryInput, whisperVisible: boolean): StoryOutput {
    return {
      chapter: this.getChapter(input),
      logline: this.getLogline(input),
      objective: this.getObjective(input),
      whisper: {
        visible: whisperVisible,
        text: this.whisperText,
        tone: this.whisperTone
      }
    };
  }

  private getChapter(input: StoryInput): string {
    if (input.dead || this.dead) return "FIM - A GRANDE UNIAO";
    if (input.moon.blood) return "ATO IV - CRIMSON AWAKENING";
    if (this.survivedBloodMoon) return "ATO V - A PARTE FALTANDO";
    if (this.sawFirstWatch) return "ATO II - A CASA APRENDE";
    return "ATO I - DESCIDA";
  }

  private getLogline(input: StoryInput): string {
    if (!this.started) return "A catedral subterranea aguarda sob a cidade.";
    if (input.dead || this.dead) return "O labirinto recuperou o que dizia ter perdido.";
    if (input.hidden) return "A parede fecha os olhos por poucos segundos.";
    if (input.moon.blood) {
      const spread = Math.round(input.moon.progress * 100);
      return `O ceu vermelho esta ${spread}% aberto. Ele sabe onde voce esta.`;
    }
    if (this.survivedBloodMoon) return "Os registros diziam sobrevivente. As paredes dizem fragmento.";
    if (this.sawFirstWatch) return "Ele aparece nas quinas para ensinar uma regra: olhar nao e estar seguro.";
    return "Procure sinais do complexo e aprenda como a casa reage ao seu movimento.";
  }

  private getObjective(input: StoryInput): string {
    if (!this.started) return "Inicie a descida.";
    if (input.dead || this.dead) return "Reinicie para tentar quebrar a Uniao.";
    if (input.hidden) return "Fique quieto ate o esconderijo soltar voce.";
    if (input.moon.blood) return "Fuja. Use botoes vermelhos nas paredes para se esconder.";
    if (!this.sawFirstWatch) return "Explore o labirinto e encontre o primeiro sinal do Boiled Man.";
    if (!this.usedXray) return "Use a lente raio X com X para estudar o monstro atraves das paredes.";
    if (!this.sawBloodMoon) return "Sobreviva ate o Crimson Awakening e aprenda sua regra principal.";
    if (!this.survivedBloodMoon) return "Sobreviva a um minuto do despertar vermelho.";
    return "Continue descendo. A historia agora procura a parte que ficou para tras.";
  }

  private pickAmbientLine(input: StoryInput): { text: string; tone: StoryTone } {
    const calmLines = [
      "Documento rasgado: a expedicao encontrou uma nave sob pedra, ou uma igreja sob carne.",
      "Nas gravacoes, uma crianca pergunta por que as paredes sabem seu nome.",
      "O governo chamou de acidente. Os sobreviventes chamaram de casa.",
      "Quando o labirinto fica quieto demais, ele esta escutando."
    ];

    const watchLines = [
      "Ele observa para medir quanto de voce ainda esta separado.",
      "Nao e uma assombracao. E uma lembranca tentando ficar inteira.",
      "Se ele some quando voce se move, nao significa que foi embora.",
      "As quinas sao palpebras. Cada corredor pisca."
    ];

    const bloodLines = [
      "A Queda Vermelha nao ilumina o mundo. Ela da forma ao que estava preso.",
      "As trombetas sao antigas demais para terem sido feitas por gente.",
      "Durante o despertar, a casa deixa de sonhar e comeca a correr.",
      "O Boiled Man nao pede morte. Ele pede companhia."
    ];

    const hiddenLines = [
      "A parede guarda voce como guarda os mortos: sem carinho, mas com memoria.",
      "Prenda a respiracao. O vermelho passa. A lembranca fica.",
      "Aqui dentro, o seu corpo faz menos barulho que o seu medo."
    ];

    const lines = input.moon.blood
      ? bloodLines
      : input.hidden
        ? hiddenLines
        : this.sawFirstWatch
          ? watchLines
          : calmLines;

    const tone: StoryTone = input.moon.blood ? "blood" : this.sawFirstWatch || input.hidden ? "watch" : "calm";
    const text = lines[this.ambientIndex % lines.length];
    this.ambientIndex++;
    return { text, tone };
  }

  private showWhisper(text: string, tone: StoryTone, duration: number): void {
    this.whisperText = text;
    this.whisperTone = tone;
    this.whisperUntil = this.now() + duration;
  }

  private now(): number {
    return performance.now() / 1000;
  }
}
