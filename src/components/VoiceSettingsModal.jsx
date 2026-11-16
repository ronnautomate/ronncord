import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, Sparkles, Volume2, Radio } from 'lucide-react';
import {
  createProcessedMicPipeline,
  getSavedVoiceSettings,
  saveVoiceSettings
} from '../lib/audioPipeline.js';

export function VoiceSettingsModal({ onClose, onApplySettings }) {
  const [settings, setSettings] = useState(getSavedVoiceSettings);
  const [devices, setDevices] = useState([]);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState({ db: -100, normalized: 0, speaking: false });
  const [error, setError] = useState('');
  const testPipelineRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.()
      .then(list => setDevices(list.filter(d => d.kind === 'audioinput')))
      .catch(() => {});

    return () => {
      testPipelineRef.current?.destroy();
      testPipelineRef.current = null;
    };
  }, []);

  async function toggleTest() {
    setError('');
    if (testing) {
      testPipelineRef.current?.destroy();
      testPipelineRef.current = null;
      setTesting(false);
      setLevel({ db: -100, normalized: 0, speaking: false });
      return;
    }

    try {
      const pipeline = await createProcessedMicPipeline(settings);
      pipeline.setMonitorEnabled(true);
      pipeline.startMeter(setLevel);
      testPipelineRef.current = pipeline;
      setTesting(true);
    } catch (err) {
      setError('Erro ao iniciar teste de microfone: ' + err.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    saveVoiceSettings(settings);
    if (onApplySettings) {
      await onApplySettings(settings);
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#57F287' }} />
            <h2>Áudio, Latência & Supressão de Ruído IA</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} className="auth-form">
          <label>
            <span>MOTOR DE SUPRESSÃO DE RUÍDO (ESTILO KRISP)</span>
            <div className="noise-modes-grid">
              <button
                type="button"
                className={`noise-mode-card ${settings.noiseMode === 'hybrid' ? 'selected' : ''}`}
                onClick={() => setSettings(s => ({ ...s, noiseMode: 'hybrid' }))}
              >
                <div className="noise-badge">MÁXIMO • ANTI-TECLADO</div>
                <strong>RONNCORD AI Max (RNNoise + GTCRN Duplo)</strong>
                <small>Cascata dupla de IA + corte de frequência vocal (110Hz–7.5kHz) + AGC desligado. Elimina teclado mecânico e barulho externo.</small>
              </button>

              <button
                type="button"
                className={`noise-mode-card ${settings.noiseMode === 'gtcrn' ? 'selected' : ''}`}
                onClick={() => setSettings(s => ({ ...s, noiseMode: 'gtcrn' }))}
              >
                <strong>RONNCORD AI Ultra (GTCRN)</strong>
                <small>Rede neural profunda única com menor uso de CPU.</small>
              </button>

              <button
                type="button"
                className={`noise-mode-card ${settings.noiseMode === 'rnnoise' ? 'selected' : ''}`}
                onClick={() => setSettings(s => ({ ...s, noiseMode: 'rnnoise' }))}
              >
                <strong>RNNoise Neural (SIMD)</strong>
                <small>Rede neural ultraleve com aceleração SIMD.</small>
              </button>

              <button
                type="button"
                className={`noise-mode-card ${settings.noiseMode === 'off' ? 'selected' : ''}`}
                onClick={() => setSettings(s => ({ ...s, noiseMode: 'off' }))}
              >
                <strong>Desligado (Estúdio)</strong>
                <small>Apenas filtro vocal + compressor, sem IA.</small>
              </button>
            </div>
          </label>

          <label>
            <span>MICROFONE DE ENTRADA</span>
            <select
              value={settings.inputDeviceId}
              onChange={e => setSettings(s => ({ ...s, inputDeviceId: e.target.value }))}
            >
              <option value="default">Padrão do Sistema</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microfone (${d.deviceId.slice(0, 6)})`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>SENSIBILIDADE DO NOISE GATE ({settings.gateThresholdDb} dB)</span>
            <input
              type="range"
              min={-70}
              max={-20}
              step={1}
              value={settings.gateThresholdDb}
              onChange={e => setSettings(s => ({ ...s, gateThresholdDb: Number(e.target.value) }))}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              Valores mais altos (-35 dB) cortam mais ruídos fracos entre palavras; -70 dB desativa o gate.
            </small>
          </label>

          <div className="mic-test-box">
            <div className="mic-test-top">
              <div>
                <strong><Mic size={14} /> Teste de Microfone em Tempo Real</strong>
                <small>Ouça exatamente como sua voz chega na call após a IA.</small>
              </div>
              <button
                type="button"
                className={testing ? 'btn-danger' : 'btn-primary'}
                onClick={toggleTest}
              >
                <Volume2 size={15} /> {testing ? 'Parar Teste' : 'Testar Microfone'}
              </button>
            </div>

            <div className="mic-meter-track">
              <div
                className={`mic-meter-fill ${level.speaking ? 'speaking' : ''}`}
                style={{ width: `${Math.round(level.normalized * 100)}%` }}
              />
            </div>
            <div className="mic-test-meta">
              <span><Radio size={12} /> Pipeline: 48kHz Interactive • Opus 10ms FEC</span>
              <span>{testing ? `${Math.round(level.db)} dB` : 'Inativo'}</span>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary">Salvar e Aplicar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
