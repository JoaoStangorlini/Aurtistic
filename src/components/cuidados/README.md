# Módulo Cuidados (Autocuidado & Interocepção Neurodivergente)

Este diretório contém os componentes e provedores de autocuidado, pausas sensoriais e alarmes ergonômicos calibrados para prevenção de fadiga por hiperfoco.

## Componentes

- `SelfCareAlarmProvider.tsx`: Contexto global e background timer que monitora os 6 pilares de autocuidado, sintetiza áudio harmônico via Web Audio API (Sino Zen 528 Hz, Acorde Lo-Fi, Bipe Suave) sem arquivos mp3 externos, despacha Web Notifications e exibe o toast flutuante com ações de *Feito ✓*, *Adiar (+5m)* e *Dispensar*.
- `SelfCareHub.tsx`: Menu retrátil e expansível acoplado ao topo da tela de Tarefas (`data-tour="self-care-hub"`). No modo compacto (padrão), opera como uma barra fina e elegante com resumo dos contadores diários e chevron animado (`expand_more`). No modo expandido, oferece botões interativos para registro de água (`+1 copo`), disparo imediato da pausa 20-20-20, checagem de postura, banheiro, refeições e medicação, além de criação de novos cuidados sob demanda. O estado retrátil é persistido em `localStorage` sob a chave `aurtistic_self_care_expanded` e reage ao evento `aurtistic:ensure-self-care-open` durante o tour guiado Coach Marks.
- `EyeRest202020Overlay.tsx`: Modal relaxante com contagem regressiva de 20 segundos para descanso visual (regra 20-20-20), animação de respiração e encerramento automático com sino suave.

## Persistência e Configuração

- `aurtistic_self_care_configs_v2`: Guarda a lista de lembretes personalizados definidos pelo usuário (inicialmente vazia, sem alarmes automáticos intrusivos impostos).
- `aurtistic_self_care_daily_log_v1`: Registra o progresso do dia atual (copos d'água ingeridos, refeições, pausas 20-20-20 e remédios tomados).
- `aurtistic_self_care_expanded`: Flag booleana do estado aberto/fechado do menu de autocuidado.

## Licença

Todo o código deste diretório é distribuído sob os termos da licença Affero GNU (AGPLv3).

