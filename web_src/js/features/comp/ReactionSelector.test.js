import $ from 'jquery';
import {beforeEach, expect, test, vi} from 'vitest';

import {initCompReactionSelector} from './ReactionSelector.js';
import {POST} from '../../modules/fetch.js';
import {showErrorToast} from '../../modules/toast.js';

vi.mock('../../modules/fetch.js', () => ({POST: vi.fn()}));
vi.mock('../../modules/toast.js', () => ({showErrorToast: vi.fn()}));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

test('shows an error when selecting a reaction returns an HTML page', async () => {
  const response = new Response('<html>login</html>', {
    status: 200,
    headers: {'Content-Type': 'text/html'},
  });
  vi.mocked(POST).mockResolvedValue(response);

  document.body.innerHTML = `
    <div class="comment">
      <div class="content">
        <div class="select-reaction" data-action-url="/repo/comments/1/reactions">
          <a class="item reaction" data-reaction-content="heart">heart</a>
        </div>
      </div>
    </div>
  `;

  initCompReactionSelector($(document));
  document.querySelector('.item.reaction').click();

  await vi.waitFor(() => expect(POST).toHaveBeenCalledWith('/repo/comments/1/reactions/react', {
    data: new URLSearchParams({content: 'heart'}),
  }));
  expect(showErrorToast).toHaveBeenCalledWith('The server returned a page instead of saving the reaction. Reload and try again.');
});

test('updates reaction markup when selecting a reaction returns JSON', async () => {
  const html = `
    <div class="ui attached segment reactions" data-action-url="/repo/comments/1/reactions">
      <a role="button" class="ui label basic primary comment-reaction-button" data-reaction-content="heart" data-has-reacted="true">
        <span class="reaction">heart</span>
        <span class="reaction-count">1</span>
      </a>
    </div>
  `;
  const response = new Response(JSON.stringify({html}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
  vi.mocked(POST).mockResolvedValue(response);

  document.body.innerHTML = `
    <div class="comment">
      <div class="content">
        <div class="select-reaction" data-action-url="/repo/comments/1/reactions">
          <a class="item reaction" data-reaction-content="heart">heart</a>
        </div>
      </div>
    </div>
  `;
  $.fn.dropdown = vi.fn();

  initCompReactionSelector($(document));
  document.querySelector('.item.reaction').click();

  await vi.waitFor(() => expect(document.querySelector('.segment.reactions')).not.toBeNull());
  expect(document.querySelector('.comment-reaction-button[data-reaction-content="heart"] .reaction-count').textContent.trim()).toBe('1');
  expect(showErrorToast).not.toHaveBeenCalled();
});
