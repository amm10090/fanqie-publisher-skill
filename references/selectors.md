# Selector checklist

## Dashboard
- Book entry selector: TBD
- Chapter management selector: `a[href*="/main/writer/chapter-manage/"]`
- New chapter button selector: `a[href*="/publish/"]` or `button:has-text("创建章节")`

## Editor
- Serial/chapter-number input selector: `input.serial-input.byte-input.byte-input-size-default`
- Title input selector: `input[placeholder="请输入标题"]`
- Body editor selector: `.ProseMirror[contenteditable="true"]`
- Save draft button selector: `.auto-editor-save-btn`
- Next button selector: `.publish-button.auto-editor-next`

## Pre-publish intercept modals
- Risk detection confirm modal: `.arco-modal.global-confirm-modal`
- Risk detection confirm button: modal `button:has-text("确定")`
- Misspelling detection modal: likely same pattern; confirm with modal `button:has-text("确定")`

## Publish modal
- Publish modal container: `.arco-modal.publish-confirm-container-new`
- AI choice group: `.arco-radio-group`
- AI=no selector: label/text `否` inside publish modal
- Scheduled publish switch: `button[role="switch"]` inside publish modal
- Confirm publish selector: button text `确认发布`
- Cancel publish selector: button text `取消`
- Date picker selector: TBD
- Time picker selector: TBD

## Success / error
- Success toast selector: TBD
- Validation error selector: TBD
