import { queryParams } from 'discourse/controllers/discovery-sortable';

// A helper to build a topic route for a filter
function filterQueryParams(params, defaultParams) {
  const findOpts = defaultParams || {};
  if (params) {
    Ember.keys(queryParams).forEach(function(opt) {
      if (params[opt]) { findOpts[opt] = params[opt]; }
    });
  }
  return findOpts;
}

function findTopicList(store, filter, filterParams, extras) {
  const tracking = Discourse.TopicTrackingState.current();

  extras = extras || {};
  return new Ember.RSVP.Promise(function(resolve) {
    const session = Discourse.Session.current();

    if (extras.cached) {
      const cachedList = session.get('topicList');

      // Try to use the cached version if it exists and is greater than the topics per page
      if (cachedList && (cachedList.get('filter') === filter) &&
        (cachedList.get('topics.length') || 0) > cachedList.get('per_page') &&
        _.isEqual(cachedList.get('listParams'), filterParams)) {
          cachedList.set('loaded', true);

          if (tracking) {
            tracking.updateTopics(cachedList.get('topics'));
          }
          return resolve(cachedList);
        }
      session.set('topicList', null);
    } else {
      // Clear the cache
      session.setProperties({topicList: null, topicListScrollPosition: null});
    }


    // Clean up any string parameters that might slip through
    filterParams = filterParams || {};
    Ember.keys(filterParams).forEach(function(k) {
      const val = filterParams[k];
      if (val === "undefined" || val === "null" || val === 'false') {
        filterParams[k] = undefined;
      }
    });

    const findParams = {};
    Discourse.SiteSettings.top_menu.split('|').forEach(function (i) {
      if (i.indexOf(filter) === 0) {
        const exclude = i.split("-");
        if (exclude && exclude.length === 2) {
          findParams.exclude_category = exclude[1];
        }
      }
    });
    return resolve(store.findFiltered('topicList', { filter, params:_.extend(findParams, filterParams || {})}));

  }).then(function(list) {
    list.set('listParams', filterParams);
    if (tracking) {
      tracking.sync(list, list.filter);
      tracking.trackIncoming(list.filter);
    }
    Discourse.Session.currentProp('topicList', list);
    return list;
  });
}

export default function(filter, extras) {
  extras = extras || {};
  return Discourse.Route.extend({
    queryParams: queryParams,

    beforeModel() {
      this.controllerFor('navigation/default').set('filterMode', filter);
    },

    model(data, transition) {

      // attempt to stop early cause we need this to be called before .sync
      Discourse.ScreenTrack.current().stop();

      const findOpts = filterQueryParams(transition.queryParams),
            extras = { cached: this.isPoppedState(transition) };

      return findTopicList(this.store, filter, findOpts, extras);
    },

    titleToken() {
      if (filter === Discourse.Utilities.defaultHomepage()) { return; }

      const filterText = I18n.t('filters.' + filter.replace('/', '.') + '.title', {count: 0});
      return I18n.t('filters.with_topics', {filter: filterText});
    },

    setupController(controller, model, trans) {
      if (trans) {
        controller.setProperties(Em.getProperties(trans, _.keys(queryParams).map(function(v){
          return 'queryParams.' + v;
        })));
      }

      const period = model.get('for_period') || (filter.indexOf('/') > 0 ? filter.split('/')[1] : '');
      const topicOpts = {
        model,
        category: null,
        period,
        selected: [],
        expandGloballyPinned: true
      };

      const params = model.get('params');
      if (params && Object.keys(params).length) {
        if (params.order !== undefined) {
          topicOpts.order = params.order;
        }
        if (params.ascending !== undefined) {
          topicOpts.ascending = params.ascending;
        }
      }
      this.controllerFor('discovery/topics').setProperties(topicOpts);

      this.openTopicDraft(model);
      this.controllerFor('navigation/default').set('canCreateTopic', model.get('can_create_topic'));
    },

    renderTemplate() {
      this.render('navigation/default', { outlet: 'navigation-bar' });
      this.render('discovery/topics', { controller: 'discovery/topics', outlet: 'list-container' });
    }
  }, extras);
}

export { filterQueryParams, findTopicList };
