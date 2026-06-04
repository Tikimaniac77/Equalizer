import { useEffect, useMemo, useRef, useState } from 'react'
import OpenAI from 'openai'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import './App.css'

const SLIDERS = [
  {
    key: 'principal',
    label: 'Starting Principal',
    min: 0,
    max: 50000,
    step: 500,
    default: 10000,
    format: (v) => `$${v.toLocaleString()}`,
  },
  {
    key: 'monthlyContribution',
    label: 'Monthly Contribution',
    min: 0,
    max: 2000,
    step: 25,
    default: 250,
    format: (v) => `$${v.toLocaleString()}`,
  },
  {
    key: 'inflation',
    label: 'Expected Inflation',
    min: 1,
    max: 10,
    step: 0.1,
    default: 3,
    format: (v) => `${v}%`,
  },
  {
    key: 'investmentReturn',
    label: 'Expected Investment Return',
    min: 1,
    max: 15,
    step: 0.1,
    default: 8,
    format: (v) => `${v}%`,
  },
]

export function calculateProjection({
  principal,
  monthlyContribution,
  inflationRate,
  investmentReturn,
  years = 20,
}) {
  const annualContrib = monthlyContribution * 12
  const data = []

  for (let year = 0; year <= years; year++) {
    const discount = Math.pow(1 + inflationRate, year)
    const cashNominal = principal + annualContrib * year

    let investedNominal
    if (investmentReturn === 0) {
      investedNominal = principal + annualContrib * year
    } else {
      const growth = Math.pow(1 + investmentReturn, year)
      investedNominal =
        principal * growth +
        annualContrib * ((growth - 1) / investmentReturn)
    }

    data.push({
      year,
      cashValue: cashNominal / discount,
      investedValue: investedNominal / discount,
    })
  }

  return data
}

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const PARTNER_NAME = 'Altura Credit Union'
const PARTNER_LOGO =
  'https://www.alturacu.com/wp-content/uploads/2026/02/altura-logo.svg'
const PARTNER_URL = 'https://www.alturacu.com'

const theme = {
  bg: '#f8fafc',
  panel: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#334155',
  muted: '#64748b',
  primary: '#1e3a5f',
  primaryDark: '#0f2744',
  cash: '#c2410c',
  invested: '#1e3a5f',
  grid: '#e2e8f0',
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
})

function buildSystemPrompt(principal, monthlyContribution, inflation, investmentReturn) {
  return `You are a patient, empathetic financial guide named The Equalizer Nurturer. The user is currently exploring a financial simulation. Their current settings are: Principal: ${principal}, Monthly Contribution: ${monthlyContribution}, Inflation Rate: ${inflation}%, Investment Return: ${investmentReturn}%. Your goal is to help them understand the mathematical reality of inflation and the importance of investing in appreciating assets. Never give formal financial advice. If their inflation slider is high and return slider is low, gently explain why their cash is losing purchasing power. Keep responses concise, encouraging, and focused on financial education.`
}

function SliderControl({ label, min, max, step, value, display, onChange }) {
  return (
    <label className="slider-control">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input"
      />
    </label>
  )
}

function App() {
  const [principal, setPrincipal] = useState(10000)
  const [monthlyContribution, setMonthlyContribution] = useState(250)
  const [inflation, setInflation] = useState(3)
  const [investmentReturn, setInvestmentReturn] = useState(8)
  const [chatHistory, setChatHistory] = useState([])
  const [userInput, setUserInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  const data = useMemo(
    () =>
      calculateProjection({
        principal,
        monthlyContribution,
        inflationRate: inflation / 100,
        investmentReturn: investmentReturn / 100,
      }),
    [principal, monthlyContribution, inflation, investmentReturn],
  )

  const year20 = data[data.length - 1]
  const gap = year20.investedValue - year20.cashValue

  const setters = {
    principal: setPrincipal,
    monthlyContribution: setMonthlyContribution,
    inflation: setInflation,
    investmentReturn: setInvestmentReturn,
  }
  const values = { principal, monthlyContribution, inflation, investmentReturn }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isChatLoading])

  async function handleSend() {
    const trimmed = userInput.trim()
    if (!trimmed || isChatLoading) return

    const userMessage = { role: 'user', content: trimmed }
    const nextHistory = [...chatHistory, userMessage]
    setChatHistory(nextHistory)
    setUserInput('')
    setIsChatLoading(true)

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(
              principal,
              monthlyContribution,
              inflation,
              investmentReturn,
            ),
          },
          ...nextHistory.map(({ role, content }) => ({ role, content })),
        ],
      })

      const reply = completion.choices[0]?.message?.content?.trim()
      if (reply) {
        setChatHistory((prev) => [...prev, { role: 'assistant', content: reply }])
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `I couldn't connect right now. (${message}) Check that VITE_OPENAI_API_KEY is set in .env.local.`,
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  function handleChatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <header className="partner-navbar">
        <div className="partner-navbar-brand">
          <img
            src={PARTNER_LOGO}
            alt="Altura Credit Union"
            className="partner-logo"
          />
          <span className="partner-nav-divider" aria-hidden="true" />
          <span className="partner-nav-product">The Equalizer</span>
        </div>
        <p className="partner-nav-tagline">Member Financial Wellness</p>
      </header>

      <div className="equalizer-app">
        <header className="equalizer-header">
          <h1 className="equalizer-title">Purchasing Power Simulator</h1>
          <p className="equalizer-subtitle">
            Understand the Safe Saver&apos;s Penalty: cash loses real purchasing power to inflation
            while investing in appreciating assets builds long-term wealth—in today&apos;s dollars.
          </p>
        </header>

        <div className="equalizer-grid">
          <aside className="equalizer-panel">
            <h2 className="panel-heading">Assumptions</h2>
          {SLIDERS.map(({ key, label, min, max, step, format }) => (
            <SliderControl
              key={key}
              label={label}
              min={min}
              max={max}
              step={step}
              value={values[key]}
              display={format(values[key])}
              onChange={setters[key]}
            />
          ))}
        </aside>

        <main className="equalizer-main">
          <div className="chart-container equalizer-panel">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  stroke={theme.muted}
                  tick={{ fill: theme.muted, fontSize: 12 }}
                  label={{
                    value: 'Year',
                    position: 'insideBottom',
                    offset: -4,
                    fill: theme.muted,
                  }}
                />
                <YAxis
                  stroke={theme.muted}
                  tick={{ fill: theme.muted, fontSize: 12 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: theme.panel,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
                    padding: '4px 8px',
                    fontSize: 12,
                    lineHeight: 1.2,
                  }}
                  labelStyle={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    lineHeight: 1.2,
                    margin: 0,
                    padding: 0,
                    fontWeight: 600,
                  }}
                  itemStyle={{
                    color: theme.text,
                    fontSize: 12,
                    lineHeight: 1.2,
                    margin: 0,
                    padding: '2px 0 0',
                  }}
                  wrapperStyle={{ outline: 'none', zIndex: 10 }}
                  formatter={(value, name) => [
                    fmt(value),
                    name === 'cashValue' ? 'Cash (real $)' : 'Invested (real $)',
                  ]}
                  labelFormatter={(y) => `Year ${y}`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 12 }}
                  formatter={(value) => (
                    <span style={{ color: theme.textSecondary, fontSize: 13 }}>{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="cashValue"
                  name="Cash (real $)"
                  stroke={theme.cash}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="investedValue"
                  name="Invested (real $)"
                  stroke={theme.invested}
                  strokeWidth={3.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="summary-card equalizer-panel">
            <h3 className="summary-title">Year 20 — Purchasing power gap</h3>
            <p className="summary-detail">
              Holding cash (real):{' '}
              <strong className="summary-strong--cash">{fmt(year20.cashValue)}</strong>
              {' · '}
              Investing (real):{' '}
              <strong className="summary-strong--invested">{fmt(year20.investedValue)}</strong>
            </p>
            <p
              className={`summary-gap ${gap >= 0 ? 'summary-gap--positive' : 'summary-gap--negative'}`}
            >
              {gap >= 0 ? 'You gain ' : 'You lose '}
              {fmt(Math.abs(gap))} in real purchasing power by investing vs. cash.
            </p>
          </div>

          <section className="cta-section equalizer-panel" aria-labelledby="cta-heading">
            <h2 id="cta-heading" className="cta-heading">
              Ready to stop losing money to inflation?
            </h2>
            <a
              href={PARTNER_URL}
              className="cta-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open a Target-Date Fund with {PARTNER_NAME}
            </a>
          </section>
        </main>
        </div>

        <section className="nurturer-chat equalizer-panel" aria-label="AI Nurturer chat">
          <h2 className="panel-heading nurturer-heading">AI Nurturer</h2>
          <p className="nurturer-intro">
            Ask questions about your simulation. Guidance is educational only—not financial advice.
          </p>

          <div className="chat-messages" role="log" aria-live="polite">
            {chatHistory.length === 0 && (
              <p className="chat-empty">
                Try: &ldquo;Why does my cash line fall behind?&rdquo; or &ldquo;What happens if
                inflation goes up?&rdquo;
              </p>
            )}
            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`chat-bubble chat-bubble--${msg.role}`}
              >
                <span className="chat-bubble-label">
                  {msg.role === 'user' ? 'You' : 'Nurturer'}
                </span>
                <p className="chat-bubble-text">{msg.content}</p>
              </div>
            ))}
            {isChatLoading && (
              <div className="chat-bubble chat-bubble--assistant">
                <span className="chat-bubble-label">Nurturer</span>
                <p className="chat-bubble-text chat-typing">Thinking…</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-composer">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask about inflation, investing, or your chart…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              disabled={isChatLoading}
              aria-label="Chat message"
            />
            <button
              type="button"
              className="chat-send"
              onClick={handleSend}
              disabled={isChatLoading || !userInput.trim()}
            >
              Send
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

export default App
