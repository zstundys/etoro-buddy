import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Money from './Money.svelte';

describe('Money', () => {
	it('formats value as currency', () => {
		render(Money, { props: { value: 1234.56 } });
		expect(screen.getByText('$1,234.56')).toBeInTheDocument();
	});

	it('shows sign when showSign is true', () => {
		render(Money, { props: { value: 100, showSign: true } });
		expect(screen.getByText('+$100.00')).toBeInTheDocument();
	});

	it('uses abs when abs is true', () => {
		render(Money, { props: { value: -50, abs: true } });
		expect(screen.getByText('$50.00')).toBeInTheDocument();
	});
});
