<script lang="ts">
  import SplitPane from '../SplitPane.svelte';

  interface Props {
    mode?: 'desktop' | 'mobile';
    ratio?: number;
    minRatio?: number;
    maxRatio?: number;
    persistKey?: string;
    onRatioChange?: (r: number) => void;
  }

  let {
    mode = 'desktop',
    ratio = 0.5,
    minRatio = 0.2,
    maxRatio = 0.8,
    persistKey,
    onRatioChange,
  }: Props = $props();
</script>

<SplitPane
  initialRatio={ratio}
  minRatio={minRatio}
  maxRatio={maxRatio}
  persistKey={persistKey}
  forceMode={mode}
  {onRatioChange}
>
  {#snippet children(slot: string)}
    <div data-slot={slot}>pane {slot}</div>
  {/snippet}
</SplitPane>
