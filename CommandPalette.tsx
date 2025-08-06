import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';

export const CommandPalette = ({ open, setOpen, commands }) => {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setOpen]);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Global Command Menu">
      <Command.Input placeholder="Type a command or search..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        {commands.map((group) => (
          <Command.Group key={group.heading} heading={group.heading}>
            {group.items.map((item) => (
              <Command.Item key={item.id} onSelect={item.action}>
                {item.icon}
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
};
