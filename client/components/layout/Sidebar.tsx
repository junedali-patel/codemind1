'use client';

import { ReactNode, useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, ChevronLeft, ChevronRight as ExpandIcon } from 'lucide-react';

interface SidebarProps {
  title: string;
  children: ReactNode;
  width?: number;
  collapsedWidth?: number;
  defaultCollapsed?: boolean;
  onClose?: () => void;
  onCollapse?: (collapsed: boolean) => void;
}

export default function Sidebar({ 
  title, 
  children, 
  width = 300, 
  collapsedWidth = 48,
  defaultCollapsed = false,
  onClose, 
  onCollapse 
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(width);

  useEffect(() => {
    if (onCollapse) {
      onCollapse(collapsed);
    }
  }, [collapsed, onCollapse]);

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  // Handle resizing
  const startResize = (e: React.MouseEvent) => {
    if (collapsed) return;
    
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth.current + (e.clientX - startX.current);
      // Constrain width between 200px and 600px
      const constrainedWidth = Math.min(Math.max(newWidth, 200), 600);
      
      // Update the width through state if needed, or directly manipulate DOM
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${constrainedWidth}px`;
      }
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, { once: true });
  };

  const currentWidth = collapsed ? collapsedWidth : width;
  const collapseIcon = collapsed ? (
    <ChevronRight className="opacity-50 group-hover:opacity-100" size={16} />
  ) : (
    <ChevronLeft className="opacity-50 group-hover:opacity-100" size={16} />
  );

  return (
    <div 
      ref={sidebarRef}
      className={`relative h-full flex flex-col transition-all duration-300 ease-in-out bg-[#1e1e1e] border-r border-[#2b2b2b]`}
      style={{ 
        width: `${currentWidth}px`,
        minWidth: `${collapsed ? collapsedWidth : 200}px`,
      }}
    >
      {/* Header */}
      <div 
        className="h-9 px-3 flex items-center justify-between bg-[#1e1e1e] border-b border-[#2b2b2b]"
        onDoubleClick={toggleCollapse}
      >
        {!collapsed && (
          <span className="text-xs font-medium text-[#cccccc] uppercase tracking-wider truncate">
            {title}
          </span>
        )}
        <div className="flex items-center">
          {!collapsed && onClose && (
            <button
              onClick={onClose}
              className="text-[#858585] hover:text-white p-1 -mr-1"
              aria-label="Close sidebar"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={toggleCollapse}
            className={`text-[#858585] hover:text-white p-1 group`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapseIcon}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div 
        className={`flex-1 overflow-y-auto transition-opacity duration-200 ${
          collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {children}
      </div>
      
      {/* Resize handle */}
      {!collapsed && (
        <div 
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-10"
          onMouseDown={startResize}
          onMouseEnter={() => document.body.style.cursor = 'col-resize'}
          onMouseLeave={() => !isResizing && (document.body.style.cursor = '')}
        />
      )}
      
      {/* Collapsed state indicator */}
      {collapsed && (
        <div 
          className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-[#2d2d2d] transition-colors"
          onClick={toggleCollapse}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          title="Expand sidebar"
        >
          <div className="transform -rotate-90 whitespace-nowrap text-xs font-medium text-[#858585] hover:text-white transition-colors">
            {isHovered ? title : <ChevronRight size={16} />}
          </div>
        </div>
      )}
    </div>
  );
}

// Add useRef import at the top
import { useRef } from 'react';
