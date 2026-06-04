import { useState, useEffect } from 'react';
import axios from 'axios';

export function useAnalytics() {
  const [overview, setOverview] = useState(null);
  const [scoreBreakdown, setScoreBreakdown] = useState([]);
  const [filterBreakdown, setFilterBreakdown] = useState([]);
  const [exitAnalysis, setExitAnalysis] = useState(null);
  const [timeAnalysis, setTimeAnalysis] = useState(null);
  const [sourceAnalysis, setSourceAnalysis] = useState([]);
  const [moonshots, setMoonshots] = useState([]);
  const [lossAnalysis, setLossAnalysis] = useState([]);
  const [dailySnapshots, setDailySnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoints = [
      { key: 'overview', url: '/api/analytics/overview', setter: setOverview },
      { key: 'score', url: '/api/analytics/score-breakdown', setter: setScoreBreakdown },
      { key: 'filter', url: '/api/analytics/filter-breakdown', setter: setFilterBreakdown },
      { key: 'exit', url: '/api/analytics/exit-analysis', setter: setExitAnalysis },
      { key: 'time', url: '/api/analytics/time-analysis', setter: setTimeAnalysis },
      { key: 'source', url: '/api/analytics/source-analysis', setter: setSourceAnalysis },
      { key: 'moonshots', url: '/api/analytics/moonshots', setter: setMoonshots },
      { key: 'loss', url: '/api/analytics/loss-analysis', setter: setLossAnalysis },
      { key: 'daily', url: '/api/analytics/daily-snapshots', setter: setDailySnapshots },
    ];

    Promise.allSettled(
      endpoints.map(e =>
        axios.get(e.url).then(r => e.setter(r.data)).catch(() => {})
      )
    ).finally(() => setLoading(false));
  }, []);

  return {
    overview, scoreBreakdown, filterBreakdown, exitAnalysis,
    timeAnalysis, sourceAnalysis, moonshots, lossAnalysis,
    dailySnapshots, loading,
  };
}
