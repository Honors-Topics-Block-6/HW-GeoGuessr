import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DailyGoalsCard from './DailyGoalsCard';

const baseProps = {
  loading: false,
  error: null,
  goalDateLabel: 'Tuesday, Feb 10',
  goals: {
    indoorTarget: 3,
    outdoorTarget: 3,
    firstLocationId: 'sample-1',
    firstWinner: null
  },
  progress: {
    indoorCount: 1,
    indoorCompleted: false,
    outdoorCount: 2,
    outdoorCompleted: false,
    firstLocationCompleted: false
  },
  firstLocationDetails: {
    description: 'Main hallway near the library'
  },
  playerId: 'player-1'
};

describe('DailyGoalsCard', () => {
  it('renders loading state', () => {
    render(<DailyGoalsCard {...baseProps} loading={true} />);

    expect(screen.getByText(/Loading goals/i)).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<DailyGoalsCard {...baseProps} error="Failed to load" />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders goals when data available', () => {
    render(<DailyGoalsCard {...baseProps} />);

    expect(screen.getByText('Daily Goals')).toBeInTheDocument();
    expect(screen.getByText(/Indoor Explorer/i)).toBeInTheDocument();
    expect(screen.getByText(/Outdoor Adventurer/i)).toBeInTheDocument();
  });

  it('shows claimed message when goal already claimed by user', () => {
    render(
      <DailyGoalsCard
        {...baseProps}
        goals={{
          ...baseProps.goals,
          firstWinner: { playerId: 'player-1' }
        }}
        progress={{
          ...baseProps.progress,
          firstLocationCompleted: true
        }}
      />
    );

    expect(screen.getByText(/You claimed the featured location/i)).toBeInTheDocument();
  });
});
