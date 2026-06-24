# The Boiled Man: The Deep Below

Prototipo de terror 3D em primeira pessoa com visual pontilhista, labirinto vivo e uma entidade que observa entre as paredes.

## Premissa

Decadas atras, uma cidade foi isolada depois que escavacoes encontraram uma catedral subterranea desconhecida. Os desaparecidos ouviam trombetas distantes, gargalhadas sob o solo e viam um rosto queimado pelas frestas das paredes.

O jogador desce ate o complexo e encontra "Aquele que permanece entre as paredes": uma consciencia ancestral fundida ao proprio labirinto. Ele nao quer apenas matar. Ele quer reconstruir a Grande Uniao.

Durante o ciclo normal, o Boiled Man observa, aparece em quinas e desaparece quando o jogador se move ou se aproxima. A cada 12 minutos acontece o Crimson Awakening, quando a Queda Vermelha retorna por 1 minuto e a entidade assume forma fisica.

## Modo Historia

A narrativa agora e dirigida por atos, objetivos e eventos do jogador:

- `Ato I - Descida`: apresenta a catedral subterranea, a cidade isolada e a ideia de que o labirinto reage ao jogador
- `Ato II - A Casa Aprende`: comeca no primeiro contato visual, explicando as regras de observacao, quinas e movimento
- `Ato IV - Crimson Awakening`: muda o objetivo para fuga direta, esconderijos e sobrevivencia de 1 minuto
- `Ato V - A Parte Faltando`: aparece apos sobreviver ao despertar e aponta para o plot twist do protagonista
- objetivos aparecem no HUD para guiar o jogador sem quebrar o misterio
- sussurros sao disparados por eventos importantes, nao sorteados sem contexto
- falas ambientais entram com intervalo maior para reforcar mundo, trauma e memoria
- o Boiled Man fala pouco e em momentos marcantes, para parecer intencional

## Stack

- TypeScript
- Vite
- Three.js

## Estrutura

- `src/runtime` contem o nucleo do jogo
- `src/scene` organiza a cena 3D e a narrativa de HUD
- `src/story` controla atos, objetivos e sussurros do modo historia
- `src/systems` guarda controle de primeira pessoa e sistemas
- `src/world` representa o mundo, o labirinto e sua camada de pontos

## Labirinto

- paredes adjacentes do mapa sao mescladas em segmentos continuos
- celulas menores reduzem a escala do labirinto e a area renderizada
- fog e camera curta limitam a distancia visivel para manter performance
- render usa pixel ratio reduzido, sem antialias, e delta de frame limitado
- o labirinto funciona narrativamente como parte do corpo do Boiled Man
- esconderijos temporarios sugerem o jogador entrando entre as paredes

## Pontilhismo 3D

O mundo usa pontos circulares como textura externa para sugerir volume:

- paredes usam pontos como textura externa de superficie, nao como preenchimento interno
- paredes usam malha base de `0.1` entre amostras, com distribuicao estratificada para evitar aglomeracoes
- superficies recebem uma pele procedural de micro-pontos para alta incidencia visual sem travar a GPU
- chao recebe uma pele procedural propria, densa e opaca como as paredes
- terreno, paredes, sombras e portal usam mais amostras reais de pontos pequenos
- ceu de crepusculo e lua sangrenta sao compostos por pontos, nao por filtro de tela
- lua e ceu ficam dentro do alcance curto da camera para aparecerem mesmo com fog forte
- a lua usa billboard de particulas para parecer sempre redonda e virada ao jogador
- durante o Crimson Awakening, particulas vermelhas preenchem o ceu a partir da lua
- pontos sao recortados por alpha test, mas renderizados como tinta opaca
- faces, bordas e contato com o chao recebem maior densidade visual
- sombras sao manchas de pontos projetadas no piso
- superficies variam de cinza a preto para criar leitura de profundidade
- movimento e interacao aumentam temporariamente o tamanho dos pontos
- cada ponto usa uma textura circular suave para evitar aparencia quadrada

## Rodar

```bash
npm install
npm run dev
```

## Controles

- `WASD` para mover
- `Shift` para correr
- `Ctrl` para agachar
- `Espaco` para pular
- `E` ou clique para interagir/pulsar os pontos
- `E` perto de um botao retangular durante o Crimson Awakening esconde o jogador por alguns segundos
- `X` para alternar a lente raio X vitoriana e ver o monstro por paredes ate 34m
- botao temporario `FORCAR AWAKENING` forca o evento para debug
- clique na tela para capturar o mouse
- mouse para olhar ao redor
- caminhada e corrida usam balanco de passos na camera

## IA do Monstro

- estados: `IDLE`, `STALK`, `WATCH`, `INVESTIGATE`, `AMBUSH`, `CHASE`, `SEARCH`, `JUMPSCARE`
- a lua fica normal por 12 minutos e inicia o Crimson Awakening por 1 minuto
- fora do Crimson Awakening o monstro so persegue de longe, espreita e encara
- durante o Crimson Awakening o monstro grita de longe e passa a perseguir o jogador
- durante o Crimson Awakening o monstro sabe a posicao atual do jogador e usa pathfinding para ir ate ele
- botoes retangulares pelo labirinto ativam esconderijos temporarios durante o Crimson Awakening
- se o jogador sobreviver ao minuto sangrento, o monstro e a lua voltam ao normal
- a musica procedural 8-bit acompanha o ciclo: normal por 12 minutos e evento sangrento por 1 minuto
- o jogador emite ruido ao andar, correr e interagir
- o monstro usa raycast contra paredes para visao
- o monstro memoriza ultima posicao vista/ouvida
- o monstro usa grafo do labirinto e pathfinding para cortar caminho
- o monstro escolhe pontos de espreita, busca e emboscada no mapa
- o estado `WATCH` privilegia pontos visiveis no campo de visao do jogador
- encaradas duram mais tempo antes de fuga, emboscada ou perseguicao
- jumpscare exige mais tensao, proximidade e tempo de observacao
- estados de tensao alteram discretamente o HUD
- chase, watch e jumpscare usam audio sintetico curto
- jumpscare so ocorre com proximidade, tensao e cooldown
- sussurros narrativos reforcam trauma, memoria, Grande Uniao e a ideia de que o protagonista ja esteve ali
- debug da IA aparece em `data-ultra-debug`

## Audio 8-bit

- scripts independentes em `public/audio/normal-theme.js` e `public/audio/blood-moon-theme.js`
- testes diretos em `public/audio/test-normal.html`, `public/audio/test-bloodmoon.html` e `public/audio/audio-controller.html`
- Web Audio API puro, sem arquivos de audio externos
- o jogo inicia a musica apos a primeira interacao do jogador para respeitar autoplay
