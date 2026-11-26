import React from 'react';
import { Box, Text } from 'ink';
import { ActivePanel } from '../types/index.js';
import Clickable from './common/ClickManager.js';
import { theme } from '../theme/theme.js';

export interface FooterProps {
  isConnected?: boolean;
  activePanel?: ActivePanel;
  width?: number;
  isMaximized?: boolean;
  selectionText?: string | null;
  onToggleHelp?: () => void;
  onSwitchConfig?: () => void;
  onToggleMaximize?: () => void;
}

interface FooterShortcutItem {
  id: string;
  keycap?: string;
  plainKey?: string;
  label: string;
  shortLabel: string;
  keyBg?: string;
  keyColor?: string;
  labelColor?: string;
  boldLabel?: boolean;
  onClick?: () => void;
}

function measureItemWidth(item: FooterShortcutItem, label: string): number {
  const keyPartWidth = item.keycap
    ? item.keycap.length + 2 + 1 // paddingX=1 (2) + marginRight=1 (1)
    : (item.plainKey ? item.plainKey.length + 1 : 0);
  const labelPartWidth = label ? label.length + 1 : 0; // trailing space
  return keyPartWidth + labelPartWidth;
}

export const Footer: React.FC<FooterProps> = React.memo(({
  isConnected = true,
  activePanel = 'services',
  width = 120,
  isMaximized = false,
  selectionText = null,
  onToggleHelp,
  onSwitchConfig,
  onToggleMaximize
}) => {
  const rightStatusLabel = isConnected ? 'Connected' : 'Offline';
  const rightStatusWidth = 2 /* "● " */ + rightStatusLabel.length;
  const availableLeftWidth = Math.max(12, width - 2 /* paddingX */ - rightStatusWidth - 1 /* marginLeft */);

  const copyLabel = selectionText ? `Copy (${selectionText})` : 'Copy';
  const shortCopyLabel = selectionText ? 'Copy*' : 'Copy';
  const zoomLabel = isMaximized ? 'Restore' : 'Zoom';
  const shortZoomLabel = isMaximized ? 'Rest' : 'Zoom';

  const shortcuts: FooterShortcutItem[] = [
    {
      id: 'help',
      keycap: '?',
      label: 'Help',
      shortLabel: 'Help',
      keyBg: theme.colors.accentDark,
      keyColor: theme.colors.accent,
      labelColor: theme.colors.textSecondary,
      onClick: onToggleHelp
    },
    {
      id: 'restart',
      keycap: 'r',
      label: 'Restart',
      shortLabel: 'Rst',
      keyBg: theme.colors.card,
      keyColor: theme.colors.textPrimary,
      labelColor: theme.colors.textSecondary
    },
    {
      id: 'stop',
      keycap: 's',
      label: 'Run/Stop',
      shortLabel: 'Stop',
      keyBg: theme.colors.stoppedBg,
      keyColor: theme.colors.stopped,
      labelColor: theme.colors.stopped
    },
    {
      id: 'copy',
      keycap: 'c',
      label: copyLabel,
      shortLabel: shortCopyLabel,
      keyBg: selectionText ? '#0369A1' : theme.colors.card,
      keyColor: selectionText ? '#FFFFFF' : theme.colors.accent,
      labelColor: selectionText ? '#38BDF8' : theme.colors.textSecondary,
      boldLabel: !!selectionText
    },
    {
      id: 'zoom',
      keycap: 'z',
      label: zoomLabel,
      shortLabel: shortZoomLabel,
      keyBg: theme.colors.card,
      keyColor: theme.colors.accent,
      labelColor: isMaximized ? theme.colors.running : theme.colors.accent,
      boldLabel: true,
      onClick: onToggleMaximize
    },
    {
      id: 'panel',
      keycap: 't',
      label: 'Panel',
      shortLabel: 'Pan',
      keyBg: theme.colors.card,
      keyColor: theme.colors.textPrimary,
      labelColor: theme.colors.textSecondary
    },
    ...(onSwitchConfig ? [{
      id: 'profile',
      keycap: 'p',
      label: 'Profile',
      shortLabel: 'Prof',
      keyBg: theme.colors.card,
      keyColor: theme.colors.accent,
      labelColor: theme.colors.accent,
      onClick: onSwitchConfig
    }] : []),
    {
      id: 'nav',
      plainKey: '↑↓',
      label: activePanel === 'services' ? 'Nav' : 'Scroll',
      shortLabel: activePanel === 'services' ? 'Nav' : 'Scr',
      keyColor: theme.colors.textMuted,
      labelColor: theme.colors.textSecondary
    },
    activePanel === 'services'
      ? {
          id: 'logs',
          keycap: 'Enter',
          label: 'Logs',
          shortLabel: 'Logs',
          keyBg: theme.colors.card,
          keyColor: theme.colors.textPrimary,
          labelColor: theme.colors.textSecondary
        }
      : {
          id: 'expand',
          keycap: 'v',
          label: 'Expand',
          shortLabel: 'Exp',
          keyBg: theme.colors.card,
          keyColor: theme.colors.accent,
          labelColor: theme.colors.textSecondary
        },
    {
      id: 'search',
      keycap: '/',
      label: 'Search',
      shortLabel: 'Find',
      keyBg: theme.colors.card,
      keyColor: theme.colors.textPrimary,
      labelColor: theme.colors.textSecondary
    },
    {
      id: 'filter',
      keycap: 'f',
      label: 'Filter',
      shortLabel: 'Filt',
      keyBg: theme.colors.card,
      keyColor: theme.colors.textPrimary,
      labelColor: theme.colors.textSecondary
    },
    {
      id: 'wrap',
      keycap: 'w',
      label: 'Wrap',
      shortLabel: 'Wrap',
      keyBg: theme.colors.card,
      keyColor: theme.colors.accent,
      labelColor: theme.colors.textSecondary
    }
  ];

  // Core shortcuts (up to Profile) should all fit if possible; switch to short/keycap labels when tight
  const coreCount = onSwitchConfig ? 7 : 6;
  const fullCoreWidth = shortcuts
    .slice(0, coreCount)
    .reduce((sum, item) => sum + measureItemWidth(item, item.label), 0);
  const shortCoreWidth = shortcuts
    .slice(0, coreCount)
    .reduce((sum, item) => sum + measureItemWidth(item, item.shortLabel), 0);

  const labelMode: 'full' | 'short' | 'keycap' =
    fullCoreWidth <= availableLeftWidth
      ? 'full'
      : shortCoreWidth <= availableLeftWidth
        ? 'short'
        : 'keycap';

  const visibleShortcuts: Array<{ item: FooterShortcutItem; label: string }> = [];
  let usedWidth = 0;

  for (const item of shortcuts) {
    const label = labelMode === 'full'
      ? item.label
      : labelMode === 'short'
        ? item.shortLabel
        : '';
    const itemWidth = measureItemWidth(item, label);
    if (usedWidth + itemWidth <= availableLeftWidth) {
      visibleShortcuts.push({ item, label });
      usedWidth += itemWidth;
    }
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      width="100%"
      height={1}
      overflow="hidden"
      backgroundColor={theme.colors.canvas}
      marginTop={0}
      paddingX={1}
      flexWrap="nowrap"
    >
      {/* Left keyboard shortcuts with deterministic width-budgeted keycaps */}
      <Box flexDirection="row" alignItems="center" flexWrap="nowrap" overflow="hidden" flexShrink={1}>
        {visibleShortcuts.map(({ item, label }) => {
          const content = (
            <Box flexDirection="row" alignItems="center" flexWrap="nowrap" flexShrink={0}>
              {item.keycap ? (
                <Box backgroundColor={item.keyBg} paddingX={1} marginRight={1} flexShrink={0}>
                  <Text color={item.keyColor} bold>{item.keycap}</Text>
                </Box>
              ) : (
                <Text color={item.keyColor}>{item.plainKey} </Text>
              )}
              {label ? (
                <Text color={item.labelColor} bold={item.boldLabel}>{label} </Text>
              ) : null}
            </Box>
          );

          if (item.onClick) {
            return (
              <Clickable key={item.id} onClick={() => item.onClick?.()} flexDirection="row" flexShrink={0}>
                {content}
              </Clickable>
            );
          }

          return <React.Fragment key={item.id}>{content}</React.Fragment>;
        })}
      </Box>

      {/* Right connection indicator */}
      <Box flexDirection="row" alignItems="center" flexShrink={0} marginLeft={1}>
        <Text color={isConnected ? theme.colors.running : theme.colors.stopped}>● </Text>
        <Text color={isConnected ? theme.colors.running : theme.colors.stopped} bold>
          {rightStatusLabel}
        </Text>
      </Box>
    </Box>
  );
});

export default Footer;
