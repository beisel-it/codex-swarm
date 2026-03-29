import React, { useEffect, useMemo, useState } from 'react'
import { render, Box, Text, useApp, useInput, useStdin } from 'ink'

import { loadDashboardData } from './data.js'
import type { DashboardData, RunRecord, SourceMode, TaskRecord, ViewMode } from './mock-data.js'
import { deriveBoardModel } from './view-model.js'

const REFRESH_MS = 8000

type ScreenState =
  | { kind: 'loading'; data: DashboardData | null; source: SourceMode; message: string; lastUpdated: string | null }
  | { kind: 'empty'; data: DashboardData; source: SourceMode; message: string; lastUpdated: string | null }
  | { kind: 'ready'; data: DashboardData; source: SourceMode; message: string; lastUpdated: string | null }
  | { kind: 'disconnected'; data: DashboardData; source: SourceMode; message: string; lastUpdated: string | null }

function App() {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const [screen, setScreen] = useState<ScreenState>({
    kind: 'loading',
    data: null,
    source: 'mock',
    message: 'Hydrating codex-swarm board…',
    lastUpdated: null,
  })
  const [selectedRunIndex, setSelectedRunIndex] = useState(0)
  const [view, setView] = useState<ViewMode>('board')
  const [liveRefresh, setLiveRefresh] = useState(true)

  const runs = screen.data?.runs ?? []
  const selectedRun = runs[selectedRunIndex] ?? runs[0] ?? null
  const boardModel = useMemo(
    () => (screen.data ? deriveBoardModel(screen.data, selectedRun?.id ?? null) : null),
    [screen.data, selectedRun?.id],
  )

  useEffect(() => {
    void refresh(true)
  }, [])

  useEffect(() => {
    if (!liveRefresh) {
      return
    }

    const intervalId = setInterval(() => {
      void refresh(false)
    }, REFRESH_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [liveRefresh, selectedRunIndex])

  async function refresh(manual: boolean) {
    if (!screen.data) {
      setScreen({
        kind: 'loading',
        data: null,
        source: 'mock',
        message: manual ? 'Refreshing codex-swarm board…' : 'Hydrating codex-swarm board…',
        lastUpdated: null,
      })
    }

    const result = await loadDashboardData()
    const nextKind =
      result.data.runs.length === 0
        ? 'empty'
        : result.fallbackReason
          ? 'disconnected'
          : 'ready'

    setScreen({
      kind: nextKind,
      data: result.data,
      source: result.source,
      message: result.fallbackReason
        ? `Disconnected from live API: ${result.fallbackReason}`
        : manual
          ? 'Manual refresh complete.'
          : 'Live board is up to date.',
      lastUpdated: new Date().toISOString(),
    })
  }

  return (
    <Box flexDirection="column" padding={1}>
      {isRawModeSupported ? (
        <KeyboardController
          runsCount={runs.length}
          exit={exit}
          refresh={refresh}
          setLiveRefresh={setLiveRefresh}
          setSelectedRunIndex={setSelectedRunIndex}
          setView={setView}
        />
      ) : null}
      <Header
        selectedRun={selectedRun}
        source={screen.source}
        lastUpdated={screen.lastUpdated}
        liveRefresh={liveRefresh}
        screenKind={screen.kind}
        interactive={isRawModeSupported}
      />
      <NavBar selectedView={view} />

      {screen.kind === 'loading' ? <StatePanel title="Loading" tone="info" message={screen.message} /> : null}
      {screen.kind === 'empty' && screen.data ? <StatePanel title="Empty" tone="warning" message="No runs were returned by the current board source." /> : null}
      {screen.kind !== 'loading' && screen.data && boardModel ? (
        <MainSurface
          data={screen.data}
          boardModel={boardModel}
          selectedRun={selectedRun}
          selectedView={view}
          statusMessage={screen.message}
          screenKind={screen.kind}
        />
      ) : null}

      <Footer interactive={isRawModeSupported} />
    </Box>
  )
}

function KeyboardController({
  runsCount,
  exit,
  refresh,
  setLiveRefresh,
  setSelectedRunIndex,
  setView,
}: {
  runsCount: number
  exit: () => void
  refresh: (manual: boolean) => Promise<void>
  setLiveRefresh: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedRunIndex: React.Dispatch<React.SetStateAction<number>>
  setView: React.Dispatch<React.SetStateAction<ViewMode>>
}) {
  useInput((input, key) => {
    if (input === 'q') {
      exit()
      return
    }

    if (input === 'r') {
      void refresh(true)
      return
    }

    if (input === ' ') {
      setLiveRefresh((current) => !current)
      return
    }

    if (input === '1') {
      setView('board')
      return
    }

    if (input === '2') {
      setView('run')
      return
    }

    if (input === '3') {
      setView('review')
      return
    }

    if (input === '4') {
      setView('fleet')
      return
    }

    if (input === '5' || input === '?') {
      setView('help')
      return
    }

    if (runsCount === 0) {
      return
    }

    if (key.leftArrow || input === 'h' || key.upArrow || input === 'k') {
      setSelectedRunIndex((current) => (current - 1 + runsCount) % runsCount)
      return
    }

    if (key.rightArrow || input === 'l' || key.downArrow || input === 'j') {
      setSelectedRunIndex((current) => (current + 1) % runsCount)
    }
  })

  return null
}

function Header({
  selectedRun,
  source,
  lastUpdated,
  liveRefresh,
  screenKind,
  interactive,
}: {
  selectedRun: RunRecord | null
  source: SourceMode
  lastUpdated: string | null
  liveRefresh: boolean
  screenKind: ScreenState['kind']
  interactive: boolean
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between">
        <Text color="cyanBright">CODEX SWARM TUI</Text>
        <Text color={source === 'api' ? 'greenBright' : 'yellowBright'}>{source === 'api' ? 'LIVE API' : 'MOCK FALLBACK'}</Text>
      </Box>
      <Box justifyContent="space-between">
        <Text color="whiteBright">{truncate(selectedRun?.goal ?? 'No active run selected', 54)}</Text>
        <Text color={screenKind === 'disconnected' ? 'yellowBright' : 'gray'}>
          {liveRefresh ? `auto ${REFRESH_MS / 1000}s` : 'manual refresh'} · {lastUpdated ? timeLabel(lastUpdated) : 'never'}
        </Text>
      </Box>
      {!interactive ? (
        <Text color="yellowBright">Non-interactive terminal detected. Live board renders, but key input is disabled.</Text>
      ) : null}
    </Box>
  )
}

function NavBar({ selectedView }: { selectedView: ViewMode }) {
  const items: Array<{ id: ViewMode; label: string }> = [
    { id: 'board', label: '1 Board' },
    { id: 'run', label: '2 Run' },
    { id: 'review', label: '3 Review' },
    { id: 'fleet', label: '4 Fleet' },
    { id: 'help', label: '5 Help' },
  ]

  return (
    <Box marginBottom={1} gap={1}>
      {items.map((item) => (
        <Text
          key={item.id}
          color={item.id === selectedView ? 'black' : 'gray'}
          {...(item.id === selectedView ? { backgroundColor: 'cyanBright' as const } : {})}
        >
          {' '}
          {item.label}
          {' '}
        </Text>
      ))}
    </Box>
  )
}

function MainSurface({
  data,
  boardModel,
  selectedRun,
  selectedView,
  statusMessage,
  screenKind,
}: {
  data: DashboardData
  boardModel: ReturnType<typeof deriveBoardModel>
  selectedRun: RunRecord | null
  selectedView: ViewMode
  statusMessage: string
  screenKind: ScreenState['kind']
}) {
  return (
    <Box flexDirection="column">
      <StatusStrip message={statusMessage} screenKind={screenKind} />
      <Box gap={1} flexWrap="wrap" marginBottom={1}>
        {boardModel.stats.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} detail={card.detail} tone={card.tone} />
        ))}
      </Box>

      {selectedView === 'board' ? (
        <BoardView data={data} boardModel={boardModel} />
      ) : null}
      {selectedView === 'run' ? (
        <RunView data={data} selectedRun={selectedRun} boardModel={boardModel} />
      ) : null}
      {selectedView === 'review' ? (
        <ReviewView boardModel={boardModel} />
      ) : null}
      {selectedView === 'fleet' ? (
        <FleetView data={data} />
      ) : null}
      {selectedView === 'help' ? <HelpView /> : null}
    </Box>
  )
}

function StatusStrip({ message, screenKind }: { message: string; screenKind: ScreenState['kind'] }) {
  const color = screenKind === 'disconnected'
    ? 'yellowBright'
    : screenKind === 'loading'
      ? 'cyanBright'
      : 'gray'
  return (
    <Box marginBottom={1}>
      <Text color={color}>{message}</Text>
    </Box>
  )
}

function BoardView({ data, boardModel }: { data: DashboardData; boardModel: ReturnType<typeof deriveBoardModel> }) {
  return (
    <Box flexDirection="row" gap={1}>
      <Box flexDirection="column" width="72%">
        <Panel title="Task Kanban" borderColor="magentaBright">
          <Box gap={1} flexWrap="wrap">
            {boardModel.lanes.map((lane) => (
              <Lane key={lane.id} title={lane.title} tasks={lane.tasks} />
            ))}
          </Box>
        </Panel>
      </Box>
      <Box flexDirection="column" width="28%" gap={1}>
        <Panel title={`Run Focus · ${boardModel.selectedRepositoryName}`} borderColor="cyanBright">
          {boardModel.selectedRun ? (
            <>
              <Line label="Status" value={formatLabel(boardModel.selectedRun.status)} />
              <Line label="Branch" value={boardModel.selectedRun.branchName ?? 'unassigned'} />
              <Line
                label="PR"
                value={
                  boardModel.selectedRun.pullRequestUrl
                    ? `#${boardModel.selectedRun.pullRequestNumber ?? 'pending'} ${boardModel.selectedRun.pullRequestStatus ?? 'open'}`
                    : formatLabel(boardModel.selectedRun.handoffStatus)
                }
              />
              <Line label="Policy" value={boardModel.selectedRun.policyProfile ?? 'standard'} />
            </>
          ) : (
            <Text color="gray">No run selected.</Text>
          )}
        </Panel>
        <Panel title="Alerts" borderColor="yellowBright">
          {boardModel.alerts.length === 0 ? (
            <Text color="greenBright">No operator alerts on the selected run.</Text>
          ) : (
            boardModel.alerts.map((alert) => (
              <AlertLine key={alert.id} label={alert.label} detail={alert.detail} tone={alert.tone} />
            ))
          )}
        </Panel>
        <Panel title="Inbox" borderColor="blueBright">
          {boardModel.inboxSummary.length === 0
            ? <Text color="gray">No recent inbox traffic.</Text>
            : boardModel.inboxSummary.map((entry, index) => <Text key={`${entry}-${index}`} color="white">{`• ${entry}`}</Text>)}
        </Panel>
      </Box>
    </Box>
  )
}

function RunView({
  data,
  selectedRun,
  boardModel,
}: {
  data: DashboardData
  selectedRun: RunRecord | null
  boardModel: ReturnType<typeof deriveBoardModel>
}) {
  const runTasks = data.tasks.filter((task) => task.runId === selectedRun?.id)
  const runAgents = data.agents.filter((agent) => agent.runId === selectedRun?.id)
  const runSessions = data.sessions.filter((session) => runAgents.some((agent) => agent.id === session.agentId))

  return (
    <Box gap={1}>
      <Box width="50%">
        <Panel title="Run Detail" borderColor="greenBright">
          {selectedRun ? (
            <>
              <Line label="Goal" value={selectedRun.goal} />
              <Line label="Creator" value={selectedRun.createdBy} />
              <Line label="Updated" value={timeLabel(selectedRun.updatedAt)} />
              <Line label="Review" value={boardModel.reviewSummary.join(' · ')} />
            </>
          ) : (
            <Text color="gray">No run selected.</Text>
          )}
        </Panel>
      </Box>
      <Box width="50%" flexDirection="column" gap={1}>
        <Panel title="Active Tasks" borderColor="magentaBright">
          {runTasks.length === 0
            ? <Text color="gray">No tasks published on this run.</Text>
            : runTasks.slice(0, 6).map((task) => <TaskLine key={task.id} task={task} compact={true} />)}
        </Panel>
        <Panel title="Session Placement" borderColor="yellowBright">
          {runSessions.length === 0
            ? <Text color="gray">No sessions published on this run.</Text>
            : runSessions.map((session) => (
              <Text key={session.id} color={session.state === 'stale' ? 'redBright' : 'white'}>
                {`${session.threadId} · ${session.workerNodeId ?? 'unplaced'} · ${formatLabel(session.state)}`}
              </Text>
            ))}
        </Panel>
      </Box>
    </Box>
  )
}

function ReviewView({ boardModel }: { boardModel: ReturnType<typeof deriveBoardModel> }) {
  return (
    <Box gap={1}>
      <Box width="50%">
        <Panel title="Review Summary" borderColor="yellowBright">
          {boardModel.reviewSummary.map((entry, index) => (
            <Text key={`${entry}-${index}`} color="white">{`• ${entry}`}</Text>
          ))}
        </Panel>
      </Box>
      <Box width="50%">
        <Panel title="Operator Attention" borderColor="magentaBright">
          {boardModel.alerts.length === 0
            ? <Text color="greenBright">No review alerts for the selected run.</Text>
            : boardModel.alerts.slice(0, 5).map((alert) => (
              <AlertLine key={alert.id} label={alert.label} detail={alert.detail} tone={alert.tone} />
            ))}
        </Panel>
      </Box>
    </Box>
  )
}

function FleetView({ data }: { data: DashboardData }) {
  return (
    <Panel title="Fleet And Dispatch" borderColor="redBright">
      {data.workerNodes.length === 0 ? (
        <Text color="gray">No worker nodes available.</Text>
      ) : (
        data.workerNodes.map((node) => (
          <Box key={node.id} flexDirection="column" marginBottom={1}>
            <Text color={node.status === 'online' ? 'greenBright' : node.status === 'degraded' ? 'yellowBright' : 'redBright'}>
              {`${node.name} · ${node.status} · drain ${node.drainState}`}
            </Text>
            <Text color="gray">
              {`eligible ${node.eligibleForScheduling ? 'yes' : 'no'} · cpu ${metric(node.metadata.cpuPercent)} · mem ${metric(node.metadata.memoryPercent)} · queue ${metric(node.metadata.queueDepth)}`}
            </Text>
          </Box>
        ))
      )}
    </Panel>
  )
}

function HelpView() {
  return (
    <Panel title="Keybindings" borderColor="blueBright">
      {[
        '1 board · 2 run · 3 review · 4 fleet · 5 help',
        'h/k or left/up selects the previous run',
        'j/l or right/down selects the next run',
        'r refreshes now',
        'space toggles live refresh',
        'q quits the TUI',
      ].map((entry) => (
        <Text key={entry} color="white">{`• ${entry}`}</Text>
      ))}
    </Panel>
  )
}

function Panel({
  title,
  borderColor,
  children,
}: {
  title: string
  borderColor: string
  children: React.ReactNode
}) {
  return (
    <Box borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0} flexDirection="column" flexGrow={1}>
      <Text color={borderColor}>{title}</Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  )
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const color = tone === 'danger' ? 'redBright' : tone === 'warning' ? 'yellowBright' : tone === 'success' ? 'greenBright' : tone === 'info' ? 'cyanBright' : 'white'
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} width={22} flexDirection="column">
      <Text color="gray">{label.toUpperCase()}</Text>
      <Text color={color} bold>{value}</Text>
      <Text color="white">{detail}</Text>
    </Box>
  )
}

function Lane({ title, tasks }: { title: string; tasks: TaskRecord[] }) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width={28} flexDirection="column">
      <Text color="whiteBright">{title}</Text>
      <Text color="gray">{tasks.length} task(s)</Text>
      <Box flexDirection="column" marginTop={1}>
        {tasks.length === 0
          ? <Text color="gray">No tasks.</Text>
          : tasks.slice(0, 4).map((task) => <TaskLine key={task.id} task={task} compact={false} />)}
      </Box>
    </Box>
  )
}

function TaskLine({ task, compact }: { task: TaskRecord; compact: boolean }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={task.status === 'blocked' ? 'yellowBright' : task.status === 'completed' ? 'greenBright' : 'white'}>
        {task.title}
      </Text>
      <Text color="gray">
        {`${task.role} · p${task.priority}${task.dependencyIds.length > 0 ? ` · blocked by ${task.dependencyIds.join(', ')}` : ''}`}
      </Text>
      {!compact ? <Text color="gray">{task.description}</Text> : null}
    </Box>
  )
}

function AlertLine({
  label,
  detail,
  tone,
}: {
  label: string
  detail: string
  tone: 'warning' | 'danger' | 'info'
}) {
  const color = tone === 'danger' ? 'redBright' : tone === 'warning' ? 'yellowBright' : 'cyanBright'
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color}>{label}</Text>
      <Text color="white">{detail}</Text>
    </Box>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Text color="white">
      <Text color="gray">{`${label}: `}</Text>
      {value}
    </Text>
  )
}

function Footer({ interactive }: { interactive: boolean }) {
  return (
    <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="gray">
        {interactive
          ? 'codex-swarm operator shell · q quit · r refresh · space live refresh · arrows/hjkl switch runs · 1-5 change view'
          : 'codex-swarm operator shell · rerun in a real TTY for keyboard navigation and live run switching'}
      </Text>
    </Box>
  )
}

function StatePanel({ title, tone, message }: { title: string; tone: 'info' | 'warning'; message: string }) {
  const color = tone === 'warning' ? 'yellowBright' : 'cyanBright'
  return (
    <Box marginBottom={1} borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color}>{`${title}: ${message}`}</Text>
    </Box>
  )
}

function formatLabel(input: string) {
  return input.replace(/_/g, ' ')
}

function timeLabel(input: string) {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - new Date(input).getTime()) / 60_000))
  if (deltaMinutes < 1) {
    return 'just now'
  }

  if (deltaMinutes === 1) {
    return '1m ago'
  }

  return `${deltaMinutes}m ago`
}

function metric(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? `${Math.round(input)}` : 'n/a'
}

function truncate(input: string, maxLength: number) {
  return input.length > maxLength ? `${input.slice(0, Math.max(0, maxLength - 1))}…` : input
}

render(<App />)
