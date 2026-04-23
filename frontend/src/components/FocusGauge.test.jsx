import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FocusGauge from './FocusGauge';

describe('FocusGauge', () => {
  it('renders the score value', () => {
    render(<FocusGauge score={75} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('rounds fractional scores', () => {
    render(<FocusGauge score={82.7} />);
    expect(screen.getByText('83')).toBeInTheDocument();
  });

  it('shows "Focused" label for scores >= 80', () => {
    render(<FocusGauge score={90} />);
    expect(screen.getByText('Focused')).toBeInTheDocument();
  });

  it('shows "Distracted" label for scores between 50 and 79', () => {
    render(<FocusGauge score={65} />);
    expect(screen.getByText('Distracted')).toBeInTheDocument();
  });

  it('shows "Away" label for scores below 50', () => {
    render(<FocusGauge score={30} />);
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('handles zero score', () => {
    render(<FocusGauge score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('handles full score', () => {
    render(<FocusGauge score={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Focused')).toBeInTheDocument();
  });
});
