"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Settings2,
  GripVertical,
  RotateCcw,
  Search,
  BarChart3,
  Zap,
  TrendingUp,
  AlertCircle,
  Bell,
  Calendar,
  Loader2,
} from "lucide-react";
import type { WidgetConfig } from "@/hooks/use-dashboard-settings";

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  BarChart3,
  Zap,
  TrendingUp,
  AlertCircle,
  Bell,
  Calendar,
};

interface SortableWidgetItemProps {
  widget: WidgetConfig & { enabled: boolean; order: number };
  onToggle: (id: string) => void;
  disabled?: boolean;
}

function SortableWidgetItem({ widget, onToggle, disabled }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = ICON_MAP[widget.icon] || Search;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-background border rounded-lg ${
        isDragging ? "shadow-lg ring-2 ring-primary" : ""
      } ${!widget.enabled ? "opacity-60" : ""}`}
    >
      <button type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded"
        aria-label={`Drag to reorder ${widget.label}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className={`rounded-lg p-2 ${widget.enabled ? "bg-primary/10" : "bg-muted"}`}>
        <IconComponent className={`h-4 w-4 ${widget.enabled ? "text-primary" : "text-muted-foreground"}`} />
      </div>

      <div className="flex-1 min-w-0">
        <Label
          htmlFor={`widget-${widget.id}`}
          className="text-sm font-medium cursor-pointer"
        >
          {widget.label}
        </Label>
        <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
      </div>

      <Switch
        id={`widget-${widget.id}`}
        checked={widget.enabled}
        onCheckedChange={() => onToggle(widget.id)}
        disabled={disabled}
      />
    </div>
  );
}

interface DashboardEditorProps {
  allWidgets: (WidgetConfig & { enabled: boolean; order: number })[];
  onToggle: (widgetId: string) => void;
  onReorder: (widgetIds: string[]) => void;
  onReset: () => void;
  isSaving?: boolean;
  trigger?: React.ReactNode;
}

export function DashboardEditor({
  allWidgets,
  onToggle,
  onReorder,
  onReset,
  isSaving,
  trigger,
}: DashboardEditorProps) {
  const [open, setOpen] = useState(false);

  // Filter to content widgets only (exclude header widgets like date-display)
  const contentWidgets = allWidgets.filter((w) => w.order >= 0);
  const headerWidgets = allWidgets.filter((w) => w.order < 0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = contentWidgets.findIndex((w) => w.id === active.id);
        const newIndex = contentWidgets.findIndex((w) => w.id === over.id);
        const newOrder = arrayMove(contentWidgets, oldIndex, newIndex);
        onReorder(newOrder.map((w) => w.id));
      }
    },
    [contentWidgets, onReorder]
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4 mr-2" />
            Customize
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Dashboard
          </SheetTitle>
          <SheetDescription>
            Toggle widgets on/off and drag to reorder. Changes save automatically.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Header widgets (non-draggable) */}
          {headerWidgets.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Header</h3>
              {headerWidgets.map((widget) => {
                const IconComponent = ICON_MAP[widget.icon] || Search;
                return (
                  <div
                    key={widget.id}
                    className={`flex items-center gap-3 p-3 bg-background border rounded-lg ${
                      !widget.enabled ? "opacity-60" : ""
                    }`}
                  >
                    <div className="w-6" /> {/* Spacer for alignment */}
                    <div className={`rounded-lg p-2 ${widget.enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <IconComponent
                        className={`h-4 w-4 ${widget.enabled ? "text-primary" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`widget-${widget.id}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {widget.label}
                      </Label>
                      <p className="text-xs text-muted-foreground truncate">
                        {widget.description}
                      </p>
                    </div>
                    <Switch
                      id={`widget-${widget.id}`}
                      checked={widget.enabled}
                      onCheckedChange={() => onToggle(widget.id)}
                      disabled={isSaving}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Content widgets (draggable) */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Content Widgets</h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={contentWidgets.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {contentWidgets.map((widget) => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={widget}
                      onToggle={onToggle}
                      disabled={isSaving}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>

            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </div>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
