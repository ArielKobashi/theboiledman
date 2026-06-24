# Ultradimensional

Protótipo inicial de um jogo 3D em primeira pessoa com visual pontilhista.

## Stack

- TypeScript
- Vite
- Three.js

## Estrutura

- `src/runtime` contém o núcleo do jogo
- `src/scene` organiza a cena 3D
- `src/systems` guarda controle de primeira pessoa e sistemas
- `src/world` representa o mundo e sua camada de pontos

## Labirinto

- paredes adjacentes do mapa sao mescladas em segmentos continuos
- celulas menores reduzem a escala do labirinto e a area renderizada
- fog e camera curta limitam a distancia visivel para manter performance
- render usa pixel ratio reduzido, sem antialias, e delta de frame limitado

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
- durante a lua sangrenta, particulas vermelhas preenchem o ceu a partir da lua
- pontos sao recortados por alpha test, mas renderizados como tinta opaca
- faces, bordas e contato com o chao recebem maior densidade visual
- sombras são manchas de pontos projetadas no piso
- superfícies variam de cinza a preto para criar leitura de profundidade
- movimento e interação aumentam temporariamente o tamanho dos pontos
- cada ponto usa uma textura circular suave para evitar aparência quadrada

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
- `E` perto de um botao retangular durante a Blood Moon esconde o jogador por alguns segundos
- `X` para alternar a lente raio X vitoriana e ver o monstro por paredes ate 34m
- botao temporario `TESTAR LUA SANGRENTA` forca o evento para debug
- Clique na tela para capturar o mouse
- Mouse para olhar ao redor
- caminhada e corrida usam balanco de passos na camera

## IA do Monstro

- estados: `IDLE`, `STALK`, `WATCH`, `INVESTIGATE`, `AMBUSH`, `CHASE`, `SEARCH`, `JUMPSCARE`
- a lua fica normal por 12 minutos e chora sangue por 1 minuto
- fora da lua sangrenta o monstro so persegue de longe, espreita e encara
- durante a lua sangrenta o monstro grita de longe e passa a perseguir o jogador
- durante a lua sangrenta o monstro sabe a posicao atual do jogador e usa pathfinding para ir ate ele
- botoes retangulares pelo labirinto ativam esconderijos temporarios durante a lua sangrenta
- se o jogador sobreviver ao minuto sangrento, o monstro e a lua voltam ao normal
- a musica procedural 8-bit acompanha o ciclo: normal por 12 minutos e Blood Moon por 1 minuto
- o jogador emite ruido ao andar, correr e interagir
- o monstro usa raycast contra paredes para visao
- o monstro memoriza ultima posicao vista/ouvida
- o monstro usa grafo do labirinto e pathfinding para cortar caminho
- o monstro escolhe pontos de espreita, busca e emboscada no mapa
- o estado WATCH privilegia pontos visiveis no campo de visao do jogador
- encaradas duram mais tempo antes de fuga, emboscada ou perseguição
- jumpscare exige mais tensao, proximidade e tempo de observacao
- estados de tensao alteram discretamente o HUD
- chase, watch e jumpscare usam audio sintetico curto
- jumpscare so ocorre com proximidade, tensao e cooldown
- debug da IA aparece em `data-ultra-debug`

## Audio 8-bit

- scripts independentes em `public/audio/normal-theme.js` e `public/audio/blood-moon-theme.js`
- testes diretos em `public/audio/test-normal.html`, `public/audio/test-bloodmoon.html` e `public/audio/audio-controller.html`
- Web Audio API puro, sem arquivos de audio externos
- o jogo inicia a musica apos a primeira interacao do jogador para respeitar autoplay
