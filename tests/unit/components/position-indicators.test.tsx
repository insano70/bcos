/**
 * PositionIndicators Component Tests
 *
 * Tests for the dot indicator component that shows chart position
 * within a dashboard.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import PositionIndicators from '@/components/charts/fullscreen-swipe/position-indicators';

describe('PositionIndicators', () => {
  describe('dot mode (10 or fewer items)', () => {
    it('should render correct number of dots', () => {
      render(<PositionIndicators total={5} current={0} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
    });

    it('should highlight the current position', () => {
      render(<PositionIndicators total={5} current={2} />);

      const buttons = screen.getAllByRole('button');

      // The third button (index 2) should have the active styling
      expect(buttons).toHaveLength(5);
      expect(buttons[2]).toHaveClass('bg-violet-500');
      expect(buttons[2]).toHaveClass('w-6');

      // Other buttons should have inactive styling
      expect(buttons[0]).toHaveClass('bg-gray-400');
      expect(buttons[0]).toHaveClass('w-2');
    });

    it('should render aria labels for accessibility', () => {
      render(<PositionIndicators total={3} current={0} />);

      expect(screen.getByRole('button', { name: 'Go to chart 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to chart 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to chart 3' })).toBeInTheDocument();
    });

    it('should mark current position with aria-current', () => {
      render(<PositionIndicators total={5} current={1} />);

      const buttons = screen.getAllByRole('button');

      expect(buttons[1]).toHaveAttribute('aria-current', 'true');
      expect(buttons[0]).not.toHaveAttribute('aria-current');
      expect(buttons[2]).not.toHaveAttribute('aria-current');
    });

    it('should call onSelect when a dot is clicked', () => {
      const onSelect = vi.fn();
      render(<PositionIndicators total={5} current={0} onSelect={onSelect} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
      const fourthButton = buttons[3];
      if (!fourthButton) throw new Error('Button not found');
      fireEvent.click(fourthButton);

      expect(onSelect).toHaveBeenCalledWith(3);
    });

    it('should apply custom className', () => {
      const { container } = render(
        <PositionIndicators total={3} current={0} className="custom-class" />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should handle edge case of single item', () => {
      render(<PositionIndicators total={1} current={0} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveClass('bg-violet-500');
    });

    it('should handle first position (index 0)', () => {
      render(<PositionIndicators total={5} current={0} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveClass('bg-violet-500');
    });

    it('should handle last position', () => {
      render(<PositionIndicators total={5} current={4} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
      expect(buttons[4]).toHaveClass('bg-violet-500');
    });

    it('should render at exactly 10 items in dot mode', () => {
      render(<PositionIndicators total={10} current={5} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(10);
    });
  });

  describe('collapsed mode (more than 10 items)', () => {
    it('should show text indicator instead of dots when more than 10 items', () => {
      render(<PositionIndicators total={15} current={7} />);

      // Should show "8 / 15" (1-indexed for display)
      expect(screen.getByText('8 / 15')).toBeInTheDocument();

      // Should NOT render buttons
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('should show first position correctly in collapsed mode', () => {
      render(<PositionIndicators total={20} current={0} />);

      expect(screen.getByText('1 / 20')).toBeInTheDocument();
    });

    it('should show last position correctly in collapsed mode', () => {
      render(<PositionIndicators total={25} current={24} />);

      expect(screen.getByText('25 / 25')).toBeInTheDocument();
    });

    it('should show collapsed at exactly 11 items', () => {
      render(<PositionIndicators total={11} current={5} />);

      expect(screen.getByText('6 / 11')).toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero items gracefully', () => {
      const { container } = render(<PositionIndicators total={0} current={0} />);

      // Should render the container but with no buttons
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('should not crash when onSelect is not provided', () => {
      render(<PositionIndicators total={3} current={0} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      const secondButton = buttons[1];
      if (!secondButton) throw new Error('Button not found');

      // Should not throw when clicking without onSelect
      expect(() => fireEvent.click(secondButton)).not.toThrow();
    });
  });
});

