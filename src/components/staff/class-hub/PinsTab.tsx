import Card from '../../ui/Card';

interface Props {
  className: string;
}

// Mirrors hubPins()/hubLoadPins(): the old app's comment on this tab is
// explicit that it "Reuses the same Result Pins engine as the dedicated
// Pins sidebar page … so there is a single source of truth for PIN
// generation — no separate table, no drift between the two entry
// points." That dedicated screen (Feature Checklist row 30 — Result
// Pins, result_pins_v2 table, verify-result-pin-v2 Edge Fn) hasn't been
// ported to vis-portal-v2 yet in an earlier phase, so there is nothing
// for this tab to wrap. Once it exists, this tab should import its
// fetch/generate/download functions and pre-fill classId — exactly what
// hubLoadPins() does by seeding window._rpCtx — rather than duplicating
// PIN generation here.
export default function PinsTab({ className }: Props) {
  return (
    <Card>
      <p className="text-sm text-brand-brown-light">
        Result Pins for <span className="font-semibold text-brand-brown-dark">{className}</span> will appear
        here once the standalone Result Pins screen is ported. This tab is wired to reuse that engine
        (result_pins_v2 / verify-result-pin-v2) rather than duplicate PIN generation.
      </p>
    </Card>
  );
}
