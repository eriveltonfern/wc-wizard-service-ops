# Padrão de layout — WCCheck 2.0

Baseado na tela "Hoje" do WC Check original. Toda tela do sistema segue este arquivo.

## Estrutura
- Sidebar navy fixa 248px + topbar branca 56px + conteúdo em fundo #F3F5F9, centralizado max-w 1220px, padding 32px. Celular: sidebar vira gaveta (☰).
- Sidebar #0B1F44: logo "WC Check" (✓ em quadrado azul radius 8, texto branco 800); caixa de contexto #14295A com bolinha verde + nome da operadora; grupos em maiúsculas 11px #7F8FB0 (DIA A DIA, GESTÃO, AJUSTES); itens 40px radius 8, texto #C9D4E8; ATIVO = fundo #1E6BF0, texto branco 600; rodapé com avatar, nome, perfil e botão sair.
- Topbar: data de hoje dd/mm/aaaa, "?" ajuda, sino com contador vermelho, avatar.
- Toda tela começa com a faixa recolhível "Ajuda desta tela" (fundo #E8F0FE, borda #CFE0FB, ícone ? azul), depois h1 (Inter 800 24px #0F2A5C) + subtítulo 14px #5B6577.

## Componentes
- Cartão KPI: branco, borda #E3E8F0, radius 10, padding 16, barra de destaque 4×32px no topo-esquerdo na cor do significado; rótulo MAIÚSCULO 12px 600 #5B6577; número 28px 800 tabular-nums na cor do significado; legenda 12px. Grade 4 colunas (2 no celular).
- Cartão-lista ("Precisa de atenção"): cabeçalho título 16px 700 + contador à direita; linhas com Nome (700) · complemento (#5B6577), barra de progresso fina 6px embaixo; selos-pílula à direita (bolinha • + texto, 12px 600) em ordem de gravidade; rodapé "Mais N … em <link>". Tabelas seguem o mesmo visual dentro de cartão branco (cabeçalho 12px maiúsculo, linhas 48px).

## Cores (só com significado)
- perigo #C8283C/#FDE7EA, pendente #A0620C/#FDF1DC, informação/ação #1E6BF0 (selo #E8F0FE texto #1E5BD8), ok #16794C/#E3F4EA, neutro #EEF1F5 texto #5B6577.
- Status: Ativo verde, Rascunho azul, Suspenso âmbar, Encerrado/Inativo cinza.
- Nas telas, só tokens de `src/styles.css`; nunca cor fixa.

## Tipografia e controles
- Fonte Inter (400/500/600/800); números com tabular-nums.
- Botão primário #1E6BF0 radius 8 altura 40; secundário branco com borda. Alvos ≥ 40px, foco visível, contraste AA, cor nunca é a única informação.

## Conteúdo
- Cada tela responde primeiro "o que precisa da minha atenção agora": KPIs no topo, lista de atenção abaixo. Números sempre com legenda.
- Estados vazio (ícone + frase + botão), carregando (esqueleto) e erro (Tentar de novo) sempre desenhados.

## Peças prontas
- `src/components/layout/`: AppShell, PageHelp, PageHeader.
- `src/components/ui-kit/`: KpiCard, AttentionList/AttentionRow, Pill, StatusBadge, DataCard, EmptyState, ErrorState, SkeletonBlock.
